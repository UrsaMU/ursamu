// Unit tests for the spirit-ridden-feral AI archetype.

import { assertEquals, assert } from "@std/assert";
import { spiritRiddenFeral } from "../../src/combat/ai/archetypes/spirit-ridden-feral.ts";
import type { Encounter, Participant } from "../../src/combat/types.ts";
import { defaultSheet } from "../../src/stats/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mkParticipant(over: Partial<Participant> = {}): Participant {
  return {
    actorId: "x", name: "x", initiative: 0, appliedDefense: 0,
    isDodging: false, isOut: false, kind: "npc", ...over,
  };
}

function mkActor(id: string) {
  const sheet = defaultSheet();
  return {
    id, name: id, flags: new Set(["npc"]),
    state: { cofd: sheet }, contents: [],
  } as unknown as Parameters<typeof spiritRiddenFeral>[0]["selfActor"];
}

function mkEnc(parts: Participant[]): Encounter {
  return {
    id: "e", roomId: "r", round: 1, turnIdx: 0,
    participants: parts, status: "active", createdAt: 0,
  };
}

Deno.test("spirit-ridden: frenzied targets highest-threat actor", OPTS, () => {
  const self = mkParticipant({
    actorId: "n1",
    aiState: { frenzied: true },
    threat: { "p1": 10, "p2": 50 },
  });
  const p1 = mkParticipant({ actorId: "p1", kind: "pc" });
  const p2 = mkParticipant({ actorId: "p2", kind: "pc" });
  const d = spiritRiddenFeral({
    self, enc: mkEnc([self, p1, p2]), selfActor: mkActor("n1"),
    others: [p1, p2],
  });
  assertEquals(d.action, "attack");
  assertEquals(d.targetId, "p2");
});

Deno.test("spirit-ridden: damaged this round attacks the attacker", OPTS, () => {
  const self = mkParticipant({
    actorId: "n1",
    aiState: { damagedThisRound: true },
    threat: { "p1": 5 },
  });
  const p1 = mkParticipant({ actorId: "p1", kind: "pc" });
  const d = spiritRiddenFeral({
    self, enc: mkEnc([self, p1]), selfActor: mkActor("n1"), others: [p1],
  });
  assertEquals(d.action, "attack");
  assertEquals(d.targetId, "p1");
  assert(d.reason.toLowerCase().includes("frenzy") || d.reason.toLowerCase().includes("wounded"));
});

Deno.test("spirit-ridden: wait when no targets", OPTS, () => {
  const self = mkParticipant({ actorId: "n1" });
  const d = spiritRiddenFeral({
    self, enc: mkEnc([self]), selfActor: mkActor("n1"), others: [],
  });
  assertEquals(d.action, "wait");
});

Deno.test("spirit-ridden: attacks any live enemy with no threat memory", OPTS, () => {
  const self = mkParticipant({ actorId: "n1" });
  const pc = mkParticipant({ actorId: "p1", kind: "pc" });
  const d = spiritRiddenFeral({
    self, enc: mkEnc([self, pc]), selfActor: mkActor("n1"), others: [pc],
  });
  assertEquals(d.action, "attack");
  assertEquals(d.targetId, "p1");
});
