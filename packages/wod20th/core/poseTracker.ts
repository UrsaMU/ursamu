// core/poseTracker.ts -- per-room pose counters.
//
// Listens to the engine's `scene:pose` hook and increments a counter on the
// room's state for each actor. Used by +vote to gate the "scene participation"
// requirement (a target must have posed N times before they're votable).
//
// Storage shape: room.state.poseCounts: Record<actorId, number>
// Reset: staff or session can clear via clearPoses(roomId).

// deno-lint-ignore no-explicit-any
import { dbojs } from "@ursamu/ursamu";
import { gameHooks } from "@ursamu/ursamu";

/** Pure helper -- increment a counter object in-memory. */
export function bumpPose(
  poseCounts: Record<string, number> | undefined,
  actorId: string,
): Record<string, number> {
  const next = { ...(poseCounts ?? {}) };
  next[actorId] = (next[actorId] ?? 0) + 1;
  return next;
}

/** How many poses has `actorId` contributed in the room? */
export function getPoseCount(
  poseCounts: Record<string, number> | undefined,
  actorId: string,
): number {
  return poseCounts?.[actorId] ?? 0;
}

// -- Hook wiring -----------------------------------------------------------
// Persist pose-count increments on the room's state. Pose-type only; OOC and
// set messages do not count toward scene participation.

interface ScenePosePayload {
  sceneId:    string;
  sceneName?: string;
  roomId?:    string;
  actorId:    string;
  actorName?: string;
  msg?:       string;
  type:       "pose" | "ooc" | "set";
}

// deno-lint-ignore no-explicit-any
async function onScenePose(e: ScenePosePayload | any): Promise<void> {
  try {
    if (!e || e.type !== "pose") return;
    const roomId  = e.roomId;
    const actorId = e.actorId;
    if (!roomId || !actorId) return;
    const room = await dbojs.queryOne({ id: roomId });
    if (!room) return;
    // deno-lint-ignore no-explicit-any
    const state  = (room as any).state ?? {};
    const current = (state.poseCounts as Record<string, number> | undefined) ?? {};
    const next    = bumpPose(current, actorId);
    await dbojs.modify({ id: roomId }, "$set", { "state.poseCounts": next } as never);
  } catch (_err) {
    // Non-fatal -- pose tracking is best-effort.
  }
}

/** Wire the scene:pose listener. Call from plugin init(). */
export function registerPoseTracker(): void {
  // deno-lint-ignore no-explicit-any
  gameHooks.on("scene:pose" as any, onScenePose as any);
}

/** Unwire. Call from plugin remove(). */
export function unregisterPoseTracker(): void {
  // deno-lint-ignore no-explicit-any
  gameHooks.off("scene:pose" as any, onScenePose as any);
}

/** Reset pose counters on a room. Staff use this when a scene ends. */
export async function clearPoses(roomId: string): Promise<void> {
  await dbojs.modify({ id: roomId }, "$set", { "state.poseCounts": {} } as never);
}
