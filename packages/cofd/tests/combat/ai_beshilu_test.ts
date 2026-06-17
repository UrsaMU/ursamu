// Unit tests for the beshilu-swarmer AI archetype decision function.

import { assertEquals, assert } from "@std/assert";
import { beshiluSwarmer } from "../../src/combat/ai/archetypes/beshilu-swarmer.ts";
import type { Encounter, Participant } from "../../src/combat/types.ts";
import { defaultSheet } from "../../src/stats/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mkParticipant(over: Partial<Participant> = {}): Participant {
  return {
    actorId: "x",
    name: "x",
    initiative: 0,
    appliedDefense: 0,
    isDodging: false,
    isOut: false,
    kind: "npc",
    ...over,
  };
}

function mkActor(id: string, healthTaken = 0) {
  const sheet = defaultSheet();
  return {
    id,
    name: id,
    flags: new Set(["npc"]),
    state: { cofd: { ...sheet, health: { bashing: healthTaken, lethal: 0, aggravated: 0 } } },
    contents: [],
  } as unknown as Parameters<typeof beshiluSwarmer>[0]["selfActor"];
}

function mkEnc(participants: Participant[]): Encounter {
  return {
    id: "enc-1",
    roomId: "r1",
    round: 1,
    turnIdx: 0,
    participants,
    status: "active",
    createdAt: 0,
  };
}

Deno.test("beshilu: flees when structure < 25%", OPTS, () => {
  // Sheet defaults: size=5, stamina=1 -> max=6. Take 5 dmg => 1/6 ~ 16% remaining.
  const self = mkParticipant({ actorId: "n1", kind: "npc" });
  const pc = mkParticipant({ actorId: "p1", kind: "pc" });
  const decision = beshiluSwarmer({
    self, enc: mkEnc([self, pc]), selfActor: mkActor("n1", 5), others: [pc],
  });
  assertEquals(decision.action, "flee");
});

Deno.test("beshilu: revenge on pack-mate-down using threat", OPTS, () => {
  const self = mkParticipant({
    actorId: "n1", kind: "npc",
    threat: { "p2": 50, "p1": 200 },
  });
  const mate = mkParticipant({ actorId: "n2", kind: "npc", isOut: true });
  const p1 = mkParticipant({ actorId: "p1", kind: "pc" });
  const p2 = mkParticipant({ actorId: "p2", kind: "pc" });
  const decision = beshiluSwarmer({
    self, enc: mkEnc([self, mate, p1, p2]), selfActor: mkActor("n1"),
    others: [mate, p1, p2],
  });
  assertEquals(decision.action, "attack");
  assertEquals(decision.targetId, "p1");
});

Deno.test("beshilu: gang-up when a pack-mate is alive", OPTS, () => {
  const self = mkParticipant({ actorId: "n1", kind: "npc" });
  const mate = mkParticipant({ actorId: "n2", kind: "npc" });
  const pc = mkParticipant({ actorId: "p1", kind: "pc" });
  const d = beshiluSwarmer({
    self, enc: mkEnc([self, mate, pc]), selfActor: mkActor("n1"),
    others: [mate, pc],
  });
  assertEquals(d.action, "attack");
  assertEquals(d.targetId, "p1");
  assert(d.reason.includes("gang-up"));
});

Deno.test("beshilu: solo NPC targets weakest available PC", OPTS, () => {
  const self = mkParticipant({ actorId: "n1", kind: "npc" });
  const p1 = mkParticipant({ actorId: "p1", kind: "pc" });
  const d = beshiluSwarmer({
    self, enc: mkEnc([self, p1]), selfActor: mkActor("n1"),
    others: [p1],
  });
  assertEquals(d.action, "attack");
  assertEquals(d.targetId, "p1");
});

Deno.test("beshilu: waits when no targets", OPTS, () => {
  const self = mkParticipant({ actorId: "n1", kind: "npc" });
  const d = beshiluSwarmer({
    self, enc: mkEnc([self]), selfActor: mkActor("n1"), others: [],
  });
  assertEquals(d.action, "wait");
});
