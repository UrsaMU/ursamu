/**
 * TinyMUX-style exit traversal (did_it attributes + defaults).
 *
 * Success: SUCC → OSUCC → ASUCC → move → DROP → ODROP → ADROP → look
 * Fail (lock): FAIL → OFAIL → AFAIL
 *
 * Attributes are read via parent-walking getAttribute, with legacy
 * data.osucc / data.odrop fallbacks. OSUCC/ODROP values are suffixes
 * after the actor name (e.g. @osucc north=heads north.).
 */
import { dbojs, hydrate } from "../world/dbobjs.ts";
import type { IDBOBJ } from "../world/types.ts";
import { evaluateLock } from "../world/locks.ts";
import { send, sessions } from "@ursamu/core";
import { getAttribute } from "../events/hooks.ts";
import { createNativeSDK } from "./sdk.ts";

/**
 * Defaults when SUCC/OSUCC/FAIL/OFAIL/ODROP are unset.
 * OSUCC/OFAIL/ODROP are suffixes after the actor name
 * (e.g. osucc "leaves." → "Diablerie leaves.").
 */
export function defaultExitMsgs(opts: {
  exitName?: string;
  destName?: string;
}): {
  succ: string;
  osucc: string;
  fail: string;
  ofail: string;
  odrop: string;
} {
  const dest = (opts.destName || "").trim() || "the room";
  const ex = (opts.exitName || "").trim() || "that way";
  return {
    succ: `You enter ${dest}.`,
    osucc: "leaves.",
    fail: "You can't go that way.",
    ofail: `tries to leave through ${ex}, but fails.`,
    odrop: "has arrived.",
  };
}

/** @deprecated use defaultExitMsgs({...}) */
export const EXIT_DEFAULTS = {
  fail: "You can't go that way.",
  ofail: "tries to leave through that way, but fails.",
  osucc: "leaves.",
  odrop: "has arrived.",
} as const;

function actorDisplayName(actor: IDBOBJ): string {
  // Prefer plain name for room broadcasts (monikers may be colored).
  return (
    (actor.data?.name as string) ||
    (actor.data?.moniker as string) ||
    actor.id ||
    "Someone"
  );
}

function exitLabel(exit: IDBOBJ): string {
  const raw = (exit.data?.name as string) || exit.id;
  return raw.split(";")[0]?.trim() || raw;
}

/**
 * Resolve an exit message attribute (parent chain + legacy data.*).
 */
export async function resolveExitAttr(
  exit: IDBOBJ,
  name: string,
): Promise<string> {
  const attr = await getAttribute(exit, name);
  if (attr?.value != null && String(attr.value).length > 0) {
    return String(attr.value);
  }
  const legacy = exit.data?.[name.toLowerCase()];
  if (typeof legacy === "string" && legacy.length > 0) return legacy;
  return "";
}

function othersMsg(
  actorName: string,
  attr: string,
  defaultSuffix: string,
): string {
  const body = (attr || defaultSuffix).trim();
  // Full custom line if builder starts with the name or a quote.
  if (
    body.toLowerCase().startsWith(actorName.toLowerCase()) ||
    body.startsWith('"') ||
    body.startsWith("'")
  ) {
    return body;
  }
  return `${actorName} ${body}`;
}

/** Resolve player dbref → live socket ids. */
function socketsForActor(actorId: string): string[] {
  return sessions
    .list()
    .filter((s) =>
      ((s as unknown as { actorId?: string }).actorId === actorId) ||
      s.sessionId === actorId
    )
    .map((s) => s.socketId);
}

/**
 * Broadcast to live sessions in a room.
 * `send()` takes socket ids — never raw player dbrefs.
 */
async function sendToConnected(
  locationId: string,
  message: string,
  excludeId?: string,
): Promise<void> {
  const here = await dbojs.query({ location: locationId });
  const socketIds = new Set<string>();
  for (const c of here) {
    if (excludeId && c.id === excludeId) continue;
    const fl = String(c.flags || "");
    if (fl.includes("exit") || fl.includes("room")) continue;
    for (const sid of socketsForActor(c.id)) socketIds.add(sid);
  }
  if (socketIds.size) send([...socketIds], message);
}

function basicLockKey(exit: IDBOBJ): string {
  const named = (exit.data?.locks as Record<string, string> | undefined)
    ?.basic;
  if (named) return named;
  const legacy = exit.data?.lock;
  return typeof legacy === "string" ? legacy : "";
}

/**
 * Walk location chain; return the first `map:…` holding id, or null.
 * Used so exits cannot eject passengers while a vehicle is launched.
 */
export async function mapHoldingOf(
  startId: string,
): Promise<string | null> {
  let cur: string | undefined = startId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur.startsWith("map:")) return cur;
    seen.add(cur);
    const obj = await dbojs.queryOne({ id: cur });
    cur = obj?.location as string | undefined;
  }
  return null;
}

/**
 * Attempt to take a matched exit. Returns true (always handled).
 */
export async function traverseExit(
  socketId: string,
  actor: IDBOBJ,
  exit: IDBOBJ,
  msg: string,
): Promise<boolean> {
  const actorId = actor.id;
  const destination = exit.data?.destination as string | undefined;
  if (!destination) {
    send([socketId], "That exit leads nowhere.");
    return true;
  }

  const destRoom = await dbojs.queryOne({ id: destination });
  if (!destRoom) {
    send([socketId], "That exit leads nowhere.");
    return true;
  }

  const fromId = actor.location;
  if (!fromId) {
    send([socketId], "You are nowhere.");
    return true;
  }

  // Parity with leave: cannot exit a vehicle/container while it is
  // on the map grid (location map:…). Nested rooms inside a vehicle
  // still work when both ends share the same map: holding.
  const fromHold = await mapHoldingOf(fromId);
  if (fromHold) {
    const toHold = await mapHoldingOf(destination);
    if (toHold !== fromHold) {
      send(
        [socketId],
        "You can't leave while this is on the map. " +
          "Use +map/land first.",
      );
      return true;
    }
  }

  const exitName = exitLabel(exit);
  const actorName = actorDisplayName(actor);
  const destName =
    (destRoom.data?.name as string) ||
    destRoom.id ||
    "the room";
  const defaults = defaultExitMsgs({ exitName, destName });
  const enactor = hydrate(actor);
  const exitObj = hydrate(exit);

  // ── Lock (basic) ──────────────────────────────────────────────────────
  const lockKey = basicLockKey(exit);
  if (lockKey) {
    const allowed = await evaluateLock(lockKey, enactor, exitObj);
    if (!allowed) {
      const uFail = await createNativeSDK(socketId, actorId, {
        name: exitName,
        original: msg,
        args: [],
      });
      const fail =
        (await uFail.eval(exit.id, "FAIL").catch(() => "")) ||
        (await resolveExitAttr(exit, "FAIL")) ||
        defaults.fail;
      send([socketId], fail);

      const ofail =
        (await resolveExitAttr(exit, "OFAIL")) || defaults.ofail;
      await sendToConnected(
        fromId,
        othersMsg(actorName, ofail, defaults.ofail),
        actorId,
      );

      const afail = await resolveExitAttr(exit, "AFAIL");
      if (afail) {
        const owner = exit.data?.owner as string | undefined;
        if (owner) {
          const socks = socketsForActor(owner);
          if (socks.length) send(socks, afail);
        }
      }
      return true;
    }
  }

  // ── Success messages (origin) — always fire (attr or default) ─────────
  const u = await createNativeSDK(socketId, actorId, {
    name: exitName,
    original: msg,
    args: [],
  });

  const succ =
    (await u.eval(exit.id, "SUCC").catch(() => "")) ||
    (await resolveExitAttr(exit, "SUCC")) ||
    defaults.succ;
  send([socketId], succ);

  const osucc =
    (await resolveExitAttr(exit, "OSUCC")) || defaults.osucc;
  await sendToConnected(
    fromId,
    othersMsg(actorName, osucc, defaults.osucc),
    actorId,
  );

  const asucc = await resolveExitAttr(exit, "ASUCC");
  if (asucc) {
    const owner = exit.data?.owner as string | undefined;
    if (owner) {
      const socks = socketsForActor(owner);
      if (socks.length) send(socks, asucc);
    }
  }

  // ── Move ──────────────────────────────────────────────────────────────
  actor.data ||= {};
  actor.data.lastCommand = Date.now();
  await dbojs.modify({ id: actorId }, "$set", {
    location: destination,
    data: actor.data,
  } as Partial<typeof actor>);

  // Rebuild SDK after move so me/here (and look) use the destination.
  const uDest = await createNativeSDK(socketId, actorId, {
    name: exitName,
    original: msg,
    args: [],
  });

  // ── Arrival messages (destination) ────────────────────────────────────
  const drop =
    (await uDest.eval(exit.id, "DROP").catch(() => "")) ||
    (await resolveExitAttr(exit, "DROP"));
  if (drop) send([socketId], drop);

  const odrop =
    (await resolveExitAttr(exit, "ODROP")) || defaults.odrop;
  await sendToConnected(
    destination,
    othersMsg(actorName, odrop, defaults.odrop),
    actorId,
  );

  const adrop = await resolveExitAttr(exit, "ADROP");
  if (adrop) {
    const owner = exit.data?.owner as string | undefined;
    if (owner) {
      const socks = socketsForActor(owner);
      if (socks.length) send(socks, adrop);
    }
  }

  // ── Look + hook ───────────────────────────────────────────────────────
  const { execLook } = await import("../verbs/look.ts");
  await execLook(uDest);

  const fromRoom = await dbojs.queryOne({ id: fromId });
  const { gameHooks } = await import("@ursamu/core");
  await (gameHooks as unknown as {
    emit(e: string, p: unknown): Promise<void>;
  }).emit("player:move", {
    actorId,
    actorName,
    fromRoomId: fromId,
    toRoomId: destination,
    fromRoomName: (fromRoom?.data?.name as string) || fromId,
    toRoomName: (destRoom.data?.name as string) || destination,
    exitName,
  });

  return true;
}
