// Move-lock enforcement: blocks combat participants from leaving the encounter
// room and notifies them why. Pure entry point, dependencies injected so the
// behavior can be unit-tested without the live SDK.

import { shouldBlockMove } from "./encounter.ts";
import type { Encounter } from "./types.ts";

export interface MoveLockActor {
  id: string;
  flags: Set<string>;
  /** Socket id if the actor is currently connected; absent otherwise. */
  socketId?: string;
}

export interface MoveLockDeps {
  loadEncounter(roomId: string): Promise<Encounter | null>;
  loadActor(actorId: string): Promise<MoveLockActor | null>;
  snapBack(actorId: string, roomId: string): Promise<void>;
  /** Best-effort send to a specific socket. No-op if the actor has no socket. */
  notify(socketId: string, msg: string): void;
}

export interface MoveLockOutcome {
  blocked: boolean;
  notified: boolean;
  /** Why the block decision came out the way it did. Useful for tests / logs. */
  reason:
    | "no-actor"
    | "no-room"
    | "no-encounter"
    | "not-participant-pre"
    | "encounter-ended-between-check-and-write"
    | "admin-exempt"
    | "blocked-no-socket"
    | "blocked-and-notified";
}

const LOCK_MESSAGE =
  "%cyYou can't leave -- combat is active in this room. Use +combat/leave to drop out, or wait for the encounter to end.%cn";

/**
 * Decide and apply the move lock for a single player:move event.
 * Returns an outcome describing the decision, suitable for tests and logging.
 *
 * Race handling: the encounter is re-fetched immediately before the snap-back
 * to close the TOCTOU window where a parallel +combat/end could have resolved
 * the encounter between the initial predicate check and the location write.
 */
export async function enforceMoveLock(
  event: { actorId: string; fromRoomId: string },
  deps: MoveLockDeps,
): Promise<MoveLockOutcome> {
  if (!event.fromRoomId) return { blocked: false, notified: false, reason: "no-room" };
  if (!event.actorId) return { blocked: false, notified: false, reason: "no-actor" };

  const encInitial = await deps.loadEncounter(event.fromRoomId);
  if (!encInitial) return { blocked: false, notified: false, reason: "no-encounter" };

  const actor = await deps.loadActor(event.actorId);
  if (!actor) return { blocked: false, notified: false, reason: "no-actor" };

  if (!shouldBlockMove(encInitial, event.actorId, actor.flags)) {
    const exempt = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");
    return {
      blocked: false,
      notified: false,
      reason: exempt ? "admin-exempt" : "not-participant-pre",
    };
  }

  // Re-fetch right before the write. If the encounter resolved or the actor
  // was removed in the meantime, abort the snap-back.
  const encRecheck = await deps.loadEncounter(event.fromRoomId);
  if (!shouldBlockMove(encRecheck, event.actorId, actor.flags)) {
    return {
      blocked: false,
      notified: false,
      reason: "encounter-ended-between-check-and-write",
    };
  }

  await deps.snapBack(actor.id, event.fromRoomId);
  if (!actor.socketId) {
    return { blocked: true, notified: false, reason: "blocked-no-socket" };
  }
  deps.notify(actor.socketId, LOCK_MESSAGE);
  return { blocked: true, notified: true, reason: "blocked-and-notified" };
}
