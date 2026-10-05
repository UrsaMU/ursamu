// Behavior tests for the move-lock enforcement handler.
//
// Covers:
//   - M1: actor is notified when a snap-back fires (no more silent enforcement)
//   - M2: TOCTOU window between "is this still combat?" and the location write
//         is closed by a recheck; if combat ended in between, no snap-back

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import { enforceMoveLock, type MoveLockActor, type MoveLockDeps } from "../src/combat/move_lock.ts";
import type { Encounter } from "../src/combat/types.ts";

function activeEnc(actorIds: string[]): Encounter {
  return {
    id: "enc-test",
    roomId: "room-1",
    status: "active",
    round: 1,
    turnIdx: 0,
    createdAt: 0,
    participants: actorIds.map((actorId) => ({
      actorId,
      name: actorId,
      initiative: 5,
      appliedDefense: 0,
      isDodging: false,
      isOut: false,
    })) as Encounter["participants"],
  };
}

function resolvedEnc(actorIds: string[]): Encounter {
  return { ...activeEnc(actorIds), status: "resolved" };
}

function actor(id: string, flags: string[] = ["player", "connected"], socketId = "sock-" + id): MoveLockActor {
  return { id, flags: new Set(flags), socketId };
}

function recordingDeps(opts: {
  encounters: (Encounter | null)[];
  actor: MoveLockActor | null;
}): MoveLockDeps & { snapBacks: Array<{ id: string; room: string }>; notifies: Array<{ socket: string; msg: string }> } {
  const snapBacks: Array<{ id: string; room: string }> = [];
  const notifies: Array<{ socket: string; msg: string }> = [];
  let encIdx = 0;
  return {
    snapBacks,
    notifies,
    loadEncounter: () => Promise.resolve(opts.encounters[encIdx++] ?? null),
    loadActor: () => Promise.resolve(opts.actor),
    snapBack: (id, room) => {
      snapBacks.push({ id, room });
      return Promise.resolve();
    },
    notify: (socket, msg) => {
      notifies.push({ socket, msg });
    },
  };
}

describe("enforceMoveLock", () => {
  it("does nothing when no encounter exists in the source room", async () => {
    const deps = recordingDeps({ encounters: [null], actor: actor("jax") });
    const r = await enforceMoveLock({ actorId: "jax", fromRoomId: "room-1" }, deps);
    assertEquals(r.blocked, false);
    assertEquals(r.reason, "no-encounter");
    assertEquals(deps.snapBacks.length, 0);
    assertEquals(deps.notifies.length, 0);
  });

  it("does nothing when the actor is not a participant", async () => {
    const enc = activeEnc(["marcus"]);
    const deps = recordingDeps({ encounters: [enc], actor: actor("jax") });
    const r = await enforceMoveLock({ actorId: "jax", fromRoomId: "room-1" }, deps);
    assertEquals(r.blocked, false);
    assertEquals(r.reason, "not-participant-pre");
    assertEquals(deps.snapBacks.length, 0);
  });

  it("admins are exempt", async () => {
    const enc = activeEnc(["admin1"]);
    const deps = recordingDeps({
      encounters: [enc],
      actor: actor("admin1", ["player", "admin"]),
    });
    const r = await enforceMoveLock({ actorId: "admin1", fromRoomId: "room-1" }, deps);
    assertEquals(r.blocked, false);
    assertEquals(r.reason, "admin-exempt");
    assertEquals(deps.snapBacks.length, 0);
    assertEquals(deps.notifies.length, 0);
  });

  // M1: silent-enforcement remediation
  it("snaps back AND notifies the actor's socket on a real block", async () => {
    const enc = activeEnc(["jax"]);
    const deps = recordingDeps({
      // Both initial check and recheck see the same active encounter.
      encounters: [enc, enc],
      actor: actor("jax"),
    });
    const r = await enforceMoveLock({ actorId: "jax", fromRoomId: "room-1" }, deps);
    assertEquals(r.blocked, true);
    assertEquals(r.notified, true);
    assertEquals(r.reason, "blocked-and-notified");
    assertEquals(deps.snapBacks, [{ id: "jax", room: "room-1" }]);
    assertEquals(deps.notifies.length, 1);
    assertEquals(deps.notifies[0].socket, "sock-jax");
    // Message must mention combat and /leave so the player knows what to do.
    if (!deps.notifies[0].msg.toLowerCase().includes("combat")) {
      throw new Error("Notify message should mention combat: " + deps.notifies[0].msg);
    }
    if (!deps.notifies[0].msg.toLowerCase().includes("leave")) {
      throw new Error("Notify message should mention /leave: " + deps.notifies[0].msg);
    }
  });

  it("snap-back still fires when the actor is offline (no socket) but notify is skipped", async () => {
    const enc = activeEnc(["jax"]);
    const offline: MoveLockActor = { id: "jax", flags: new Set(["player"]) };
    const deps = recordingDeps({ encounters: [enc, enc], actor: offline });
    const r = await enforceMoveLock({ actorId: "jax", fromRoomId: "room-1" }, deps);
    assertEquals(r.blocked, true);
    assertEquals(r.notified, false);
    assertEquals(r.reason, "blocked-no-socket");
    assertEquals(deps.snapBacks.length, 1);
    assertEquals(deps.notifies.length, 0);
  });

  // M2: TOCTOU remediation
  it("does NOT snap back when the encounter resolves between the initial check and the recheck", async () => {
    const enc = activeEnc(["jax"]);
    const ended = resolvedEnc(["jax"]);
    const deps = recordingDeps({
      // First load: active, would block. Second load: resolved.
      encounters: [enc, ended],
      actor: actor("jax"),
    });
    const r = await enforceMoveLock({ actorId: "jax", fromRoomId: "room-1" }, deps);
    assertEquals(r.blocked, false);
    assertEquals(r.reason, "encounter-ended-between-check-and-write");
    assertEquals(deps.snapBacks.length, 0);
    assertEquals(deps.notifies.length, 0);
  });

  it("does NOT snap back when the actor is removed from participants between checks", async () => {
    const enc = activeEnc(["jax"]);
    const dropped = activeEnc(["marcus"]); // jax no longer in list
    const deps = recordingDeps({
      encounters: [enc, dropped],
      actor: actor("jax"),
    });
    const r = await enforceMoveLock({ actorId: "jax", fromRoomId: "room-1" }, deps);
    assertEquals(r.blocked, false);
    assertEquals(r.reason, "encounter-ended-between-check-and-write");
    assertEquals(deps.snapBacks.length, 0);
  });
});
