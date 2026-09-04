/**
 * Shared object move: leave/arrive room messages, DB update,
 * object:moved hook, optional auto-look for players.
 */
import { send, sessions, gameHooks } from "@ursamu/core";
import { dbojs } from "./dbobjs.ts";
import type { IDBOBJ } from "./types.ts";

function displayName(obj: IDBOBJ): string {
  return String(
    obj.data?.moniker ?? obj.data?.name ?? obj.id ?? "Someone",
  );
}

/** Live socket ids for a player dbref. */
export function socketsForPlayer(playerId: string): string[] {
  return sessions
    .list()
    .filter((s) => {
      const aid = (s as unknown as { actorId?: string }).actorId;
      return aid === playerId || s.sessionId === playerId;
    })
    .map((s) => s.socketId);
}

/** Send to connected players in a room (socket ids, never raw dbrefs). */
export async function sendToRoom(
  locationId: string,
  message: string,
  excludeId?: string,
): Promise<void> {
  const here = await dbojs.query({ location: locationId });
  const socks = new Set<string>();
  for (const c of here) {
    if (excludeId && c.id === excludeId) continue;
    const fl = String(c.flags || "").toLowerCase();
    if (fl.includes("exit") || fl.includes("room")) continue;
    if (!fl.includes("connected") && !fl.includes("player")) {
      // still try sockets — connected flag may lag
    }
    for (const sid of socketsForPlayer(c.id)) socks.add(sid);
  }
  if (socks.size) send([...socks], message);
}

export type MoveOpts = {
  targetId: string;
  destinationId: string;
  /** Suppress leave/arrive lines. */
  quiet?: boolean;
  /** Run look for the moved player (default true if player). */
  look?: boolean;
  /** Cause string for object:moved. */
  cause?: string;
  actorId?: string;
};

/**
 * Move an object. Returns false if target or destination missing.
 */
export async function moveObject(opts: MoveOpts): Promise<boolean> {
  const target = await dbojs.queryOne({ id: opts.targetId });
  const dest = await dbojs.queryOne({ id: opts.destinationId });
  if (!target || !dest) return false;

  const fromId = target.location as string | undefined;
  const name = displayName(target);
  const quiet = opts.quiet === true;

  if (!quiet && fromId && fromId !== opts.destinationId) {
    await sendToRoom(fromId, `${name} has left.`, target.id);
  }

  await dbojs.modify(
    { id: target.id },
    "$set",
    { location: opts.destinationId } as Partial<IDBOBJ>,
  );

  if (!quiet && opts.destinationId !== fromId) {
    const fromRoom = fromId
      ? await dbojs.queryOne({ id: fromId })
      : null;
    const fromStr = fromRoom?.data?.name
      ? ` from ${fromRoom.data.name}`
      : "";
    await sendToRoom(
      opts.destinationId,
      `${name} has arrived${fromStr}.`,
      target.id,
    );
  }

  try {
    await gameHooks.emit("object:moved", {
      objectId: target.id,
      from: fromId ?? null,
      to: opts.destinationId,
      cause: opts.cause ?? "move",
      actorId: opts.actorId ?? target.id,
    });
  } catch (e: unknown) {
    console.error("[move] object:moved hook:", e);
  }

  const isPlayer = String(target.flags || "").toLowerCase()
    .includes("player");
  const doLook = opts.look !== false && isPlayer;
  if (doLook) {
    await forceLook(target.id);
  }
  return true;
}

/** Force `look` on all live sessions for a player. */
export async function forceLook(playerId: string): Promise<void> {
  const socks = socketsForPlayer(playerId);
  if (!socks.length) return;
  try {
    const { createNativeSDK } = await import(
      "../commands/sdk.ts"
    );
    for (const sid of socks) {
      const u = await createNativeSDK(sid, playerId, {
        name: "look",
        original: "look",
        args: [],
      });
      await u.execute("look");
    }
  } catch (e: unknown) {
    console.error("[move] auto-look failed:", e);
  }
}
