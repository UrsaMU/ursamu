/**
 * Named stage functions for the MUSH command dispatch pipeline.
 *
 * Each stage returns a boolean:
 *   true  = handled — stop processing
 *   false = not handled — continue to next stage
 */
import type { ICmd, IDBObj } from "./types.ts";
import { dbojs, hydrate } from "../world/dbobjs.ts";
import { evaluateLock } from "../world/locks.ts";
import { send, getConfig } from "@ursamu/core";
import { createNativeSDK } from "./sdk.ts";
import { InterceptorService } from "../world/interceptor-service.ts";
import type { Intent as InterceptIntent } from "../world/interceptor-service.ts";

// ---------------------------------------------------------------------------
// parseIntent
// ---------------------------------------------------------------------------

export interface Intent {
  name: string;
  args: string[];
  switches: string[];
  raw: string;
}

export function parseIntent(msg: string, _actorId: string): { intentName: string; intent: Intent } {
  const trimmed = msg.trim();
  const spaceIdx = trimmed.indexOf(" ");
  const name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

  const [base, ...switchParts] = name.split("/");
  const switches = switchParts.filter(Boolean);
  const args = rest ? [rest] : [];

  return {
    intentName: base.toLowerCase(),
    intent: { name: base.toLowerCase(), args, switches, raw: trimmed },
  };
}

// ---------------------------------------------------------------------------
// checkInterceptors
// ---------------------------------------------------------------------------

/**
 * Run AOP interceptor scripts on objects in the actor's room.
 *
 * Scans every object in `roomId` for a SCRIPT attribute. Objects that have
 * one are passed to InterceptorService as candidates. Any candidate whose
 * script calls `u.intercept(intent)` and returns `false` blocks the command.
 */
export async function checkInterceptors(
  roomId:  string | null,
  actorId: string,
  intent:  { name: string; args: string[]; targetId?: string },
): Promise<boolean> {
  if (!roomId) return true;

  const contents = await dbojs.query({ location: roomId });
  const candidates = contents
    .filter((obj) => {
      const attrs = obj.data?.attributes as Array<{ name: string; value: string }> | undefined;
      return attrs?.some((a) => a.name.toUpperCase() === "SCRIPT");
    })
    .map((obj) => {
      const attrs = obj.data?.attributes as Array<{ name: string; value: string }> | undefined;
      const script = attrs?.find((a) => a.name.toUpperCase() === "SCRIPT")?.value ?? "";
      return { id: obj.id, script, state: (obj.data?.state as Record<string, unknown>) ?? {} };
    });

  if (candidates.length === 0) return true;

  const interceptIntent: InterceptIntent = {
    name:     intent.name,
    actorId,
    targetId: intent.targetId,
    args:     intent.args,
  };

  return InterceptorService.intercept(interceptIntent, candidates);
}

// ---------------------------------------------------------------------------
// runScriptNode
// ---------------------------------------------------------------------------

/**
 * Handle SCRIPT_NODE objects.
 * Returns true if a matching script ran.
 *
 */
export async function runScriptNode(
  socketId: string,
  actorId: string,
  intentName: string,
): Promise<boolean> {
  const char = actorId ? await dbojs.queryOne({ id: actorId }) : null;
  if (!char || !char.flags.includes("SCRIPT_NODE")) return false;

  const attrs = (char.data?.attributes as Array<{ name: string; value: string }> | undefined) || [];
  const scriptAttr = attrs.find((a) => a.name.toLowerCase() === `cmd:${intentName}`);
  if (!scriptAttr?.value) return false;

  try {
    const { runSoftcodeSimple } = await import("../softcode/engine.ts");
    await runSoftcodeSimple(scriptAttr.value, {
      actorId,
      executorId: actorId,
      args: [],
      socketId,
    });
  } catch (e: unknown) {
    console.warn("[pipeline] runScriptNode failed:", e);
  }
  return true;
}

// ---------------------------------------------------------------------------
// matchNativeCmd
// ---------------------------------------------------------------------------

/**
 * Match input against addCmd() registrations.
 * Returns true if a command matched and executed.
 */
export async function matchNativeCmd(
  socketId: string,
  actorId: string,
  msg: string,
  cmds: ICmd[],
): Promise<boolean> {
  const rawActor = actorId ? await dbojs.queryOne({ id: actorId }) : null;
  const actor: IDBObj = rawActor
    ? hydrate(rawActor)
    : { id: "#-1", flags: new Set<string>(), state: {}, contents: [] };

  const rawMsg = msg.trim();
  const strippedMsg = rawMsg.replace(/^[@+]/, "");

  for (const cmd of cmds) {
    const match =
      rawMsg.match(cmd.pattern) ??
      (strippedMsg !== rawMsg ? strippedMsg.match(cmd.pattern) : null);
    if (!match) continue;
    if (!(await evaluateLock(cmd.lock || "", actor, actor))) continue;

    if (rawActor) {
      rawActor.data ||= {};
      rawActor.data.lastCommand = Date.now();
      await dbojs.modify({ id: rawActor.id }, "$set", rawActor);
    }

    const u = await createNativeSDK(socketId, actorId || "#-1", {
      name: cmd.name,
      original: msg,
      args: match.slice(1),
    });

    await (cmd.exec(u) as Promise<void>)?.catch((e: Error) => {
      console.error(e);
      send(
        [socketId],
        `Uh oh! You've run into an error! Please contact staff with the following info!%r%r%chError:%cn ${e}`,
      );
    });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// matchSoftcodePattern
// ---------------------------------------------------------------------------

/**
 * Scan the actor's environment for $-pattern softcode attributes.
 * Returns true if a pattern matched and ran.
 */
export async function matchSoftcodePattern(
  socketId: string,
  actorId: string,
  msg: string,
): Promise<boolean> {
  if (!actorId || !msg) return false;

  const actor = await dbojs.queryOne({ id: actorId });
  if (!actor) return false;

  const masterRoomId = getConfig<string>("game.masterRoom") || "0";

  // Build candidate objects: actor, room, room contents, master room + contents
  const candidates = new Map<string, typeof actor>();

  const addCandidates = async (locationId: string) => {
    const loc = await dbojs.queryOne({ id: locationId });
    if (loc) candidates.set(loc.id, loc);
    const contents = await dbojs.query({ location: locationId });
    for (const c of contents) candidates.set(c.id, c);
  };

  candidates.set(actor.id, actor);
  if (actor.location) await addCandidates(actor.location);
  if (masterRoomId !== actor.location) await addCandidates(masterRoomId);

  const trimmedMsg = msg.trim();

  for (const obj of candidates.values()) {
    const attrs = (obj.data?.attributes as Array<{ name: string; value: string }> | undefined) || [];
    const dollarAttrs = attrs.filter((a) => a.value.startsWith("$"));

    for (const attr of dollarAttrs) {
      const rawPattern = attr.value.slice(1).split(":")[0];
      if (!rawPattern) continue;

      let regex: RegExp;
      try {
        const escaped = rawPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, "(.*)");
        regex = new RegExp(`^${escaped}$`, "i");
      } catch (_e: unknown) {
        continue;
      }

      const match = trimmedMsg.match(regex);
      if (!match) continue;

      const actionPart = attr.value.slice(1).split(":").slice(1).join(":");
      if (!actionPart.trim()) continue;

      try {
        const { runSoftcodeSimple } = await import("../softcode/engine.ts");
        const result = await runSoftcodeSimple(actionPart, {
          actorId,
          executorId: obj.id,
          args: match.slice(1),
          socketId,
        });
        if (result?.trim()) {
          const { cmds } = await import("./addCmd.ts");
          await matchNativeCmd(socketId, actorId, result.trim(), cmds);
        }
      } catch (e: unknown) {
        console.warn("[pipeline] matchSoftcodePattern exec failed:", e);
      }
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// matchExits
// ---------------------------------------------------------------------------

/**
 * Match input against exit names in the actor's current room.
 * Returns true if an exit was taken.
 */
export async function matchExits(
  socketId: string,
  actorId: string,
  msg: string,
): Promise<boolean> {
  if (!actorId || !msg) return false;

  const actor = await dbojs.queryOne({ id: actorId });
  if (!actor?.location) return false;

  const trimmedMsg = msg.trim().toLowerCase();
  const exits = await dbojs.query({ location: actor.location, flags: /exit/i });

  for (const exit of exits) {
    const rawName = (exit.data?.name as string) || exit.id;
    const aliases = rawName.split(";").map((p) => p.trim().toLowerCase());
    if (!aliases.some((a) => a === trimmedMsg || trimmedMsg.startsWith(a))) continue;

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
    const exitName = aliases[0] || rawName;

    actor.data ||= {};
    actor.data.lastCommand = Date.now();
    await dbojs.modify({ id: actorId }, "$set", {
      location: destination,
      data: actor.data,
    } as Partial<typeof actor>);

    const actorName = (actor.data?.moniker as string) || (actor.data?.name as string) || "Someone";
    const fromRoom = await dbojs.queryOne({ id: fromId });
    const fromContents = await dbojs.query({ location: fromId });

    // Announce departure
    const odrop = exit.data?.odrop as string | undefined;
    const departMsg = odrop || `${actorName} has left.`;
    for (const c of fromContents) {
      if (c.id !== actorId && c.flags.includes("connected")) {
        send([c.id], departMsg);
      }
    }

    // Announce arrival
    const destContents = await dbojs.query({ location: destination });
    const osucc = exit.data?.osucc as string | undefined;
    const arriveMsg = osucc || `${actorName} has arrived.`;
    for (const c of destContents) {
      if (c.id !== actorId && c.flags.includes("connected")) {
        send([c.id], arriveMsg);
      }
    }

    const u = await createNativeSDK(socketId, actorId, {
      name: exitName,
      original: msg,
      args: [],
    });
    // Trigger look
    const { execLook } = await import("../verbs/look.ts");
    await execLook(u);

    const { gameHooks } = await import("@ursamu/core");
    await (gameHooks as unknown as { emit(e: string, p: unknown): Promise<void> }).emit("player:move", {
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
  return false;
}
