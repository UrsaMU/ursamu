// Unit tests for the azlu-stalker AI archetype.

import { assertEquals, assert } from "@std/assert";
import { azluStalker } from "../../src/combat/ai/archetypes/azlu-stalker.ts";
import type { Encounter, Participant } from "../../src/combat/types.ts";
import { defaultSheet } from "../../src/stats/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mkParticipant(over: Partial<Participant> = {}): Participant {
  return {
    actorId: "x", name: "x", initiative: 0, appliedDefense: 0,
    isDodging: false, isOut: false, kind: "npc", ...over,
  };
}

function mkActor(id: string, healthTaken = 0) {
  const sheet = defaultSheet();
  return {
    id, name: id, flags: new Set(["npc"]),
    state: { cofd: { ...sheet, health: { bashing: healthTaken, lethal: 0, aggravated: 0 } } },
    contents: [],
  } as unknown as Parameters<typeof azluStalker>[0]["selfActor"];
}

function mkEnc(parts: Participant[]): Encounter {
  return {
    id: "e", roomId: "r", round: 1, turnIdx: 0,
    participants: parts, status: "active", createdAt: 0,
  };
}

Deno.test("azlu: unrevealed sets ambush posture", OPTS, () => {
  const self = mkParticipant({ actorId: "n1" });
  const pc = mkParticipant({ actorId: "p1", kind: "pc" });
  const d = azluStalker({
    self, enc: mkEnc([self, pc]), selfActor: mkActor("n1"), others: [pc],
  });
  assertEquals(d.action, "posture");
  assertEquals(d.posture?.type, "ambush");
});

Deno.test("azlu: wounded under 50% seeks cover", OPTS, () => {
  // max = 6; take 4 -> 2/6 = 33%.
  const self = mkParticipant({ actorId: "n1", aiState: { revealed: true } });
  const pc = mkParticipant({ actorId: "p1", kind: "pc" });
  const d = azluStalker({
    self, enc: mkEnc([self, pc]), selfActor: mkActor("n1", 4), others: [pc],
  });
  assertEquals(d.action, "move");
  assert(d.reason.toLowerCase().includes("cover"));
});

Deno.test("azlu: attacks lone target when revealed", OPTS, () => {
  const self = mkParticipant({ actorId: "n1", aiState: { revealed: true } });
  const pc = mkParticipant({ actorId: "p1", kind: "pc" });
  const d = azluStalker({
    self, enc: mkEnc([self, pc]), selfActor: mkActor("n1"), others: [pc],
  });
  assertEquals(d.action, "attack");
  assertEquals(d.targetId, "p1");
  assert(d.reason.includes("isolated"));
});

Deno.test("azlu: closest-target fallback for multi-enemy", OPTS, () => {
  const self = mkParticipant({ actorId: "n1", aiState: { revealed: true } });
  const p1 = mkParticipant({ actorId: "p1", kind: "pc" });
  const p2 = mkParticipant({ actorId: "p2", kind: "pc" });
  const d = azluStalker({
    self, enc: mkEnc([self, p1, p2]), selfActor: mkActor("n1"),
    others: [p1, p2],
  });
  assertEquals(d.action, "attack");
});
