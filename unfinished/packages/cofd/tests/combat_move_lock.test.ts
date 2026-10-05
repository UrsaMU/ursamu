// Move-lock predicate: blocks participants of an active encounter from
// leaving the room, with admin/wizard exemption.

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import { shouldBlockMove } from "../src/combat/encounter.ts";
import type { Encounter } from "../src/combat/types.ts";

function enc(status: Encounter["status"], actorIds: string[]): Encounter {
  return {
    id: "enc-test",
    roomId: "room-1",
    status,
    round: 1,
    turnIdx: 0,
    createdAt: 0,
    participants: actorIds.map((actorId) => ({
      actorId,
      initiative: 5,
      appliedDefense: 0,
      isDodging: false,
    })) as Encounter["participants"],
  };
}

describe("shouldBlockMove", () => {
  it("blocks a non-admin participant in an active encounter", () => {
    const ok = shouldBlockMove(enc("active", ["jax"]), "jax", ["player", "connected"]);
    assertEquals(ok, true);
  });

  it("does not block when no encounter exists", () => {
    assertEquals(shouldBlockMove(null, "jax", ["player"]), false);
  });

  it("does not block when encounter is resolved", () => {
    assertEquals(shouldBlockMove(enc("resolved", ["jax"]), "jax", ["player"]), false);
  });

  it("does not block bystanders who are not in the encounter", () => {
    assertEquals(shouldBlockMove(enc("active", ["jax"]), "marcus", ["player"]), false);
  });

  it("exempts admins", () => {
    assertEquals(shouldBlockMove(enc("active", ["admin1"]), "admin1", ["player", "admin"]), false);
  });

  it("exempts wizards", () => {
    assertEquals(shouldBlockMove(enc("active", ["wiz1"]), "wiz1", ["player", "wizard"]), false);
  });
});
