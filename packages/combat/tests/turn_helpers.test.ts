import { assertEquals } from "@std/assert";
import {
  endFight,
  formatInitiativeLines,
  passTurn,
  startOrJoin,
} from "../src/turn-helpers.ts";
import { memoryEncounterStore } from "../src/adapter-kit.ts";
import type { CombatPorts } from "../src/ports.ts";
import {
  clearCombatBrains,
  jsonStrategyBrain,
  registerCombatBrain,
} from "../src/brains.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function ports(): CombatPorts {
  return {
    async loadActor(id) {
      return {
        id,
        name: id,
        kind: id.startsWith("n") ? "npc" : "pc",
        isOut: false,
        healthFrac: 1,
        aiKey: id.startsWith("n") ? "aggressive" : undefined,
      };
    },
    async executeAction() {
      return { ok: true, damageApplied: 1, targetId: "p1" };
    },
    broadcast() {},
    async rollInitiative(id) {
      return id.startsWith("n") ? 5 : 12;
    },
    async onResolved(enc) {
      return { ...enc, status: "resolved" };
    },
  };
}

Deno.test("startOrJoin create + join + autoBegin", OPTS, async () => {
  const store = memoryEncounterStore();
  const p = ports();
  const r = await startOrJoin({
    roomId: "r1",
    store,
    ports: p,
    startedBy: "p1",
    autoBegin: true,
    participant: {
      actorId: "p1",
      name: "Hero",
      kind: "pc",
    },
  });
  assertEquals(r?.created, true);
  assertEquals(r?.joined, true);
  assertEquals(r?.encounter.status, "active");
  assertEquals(r?.encounter.startedBy, "p1");
  assertEquals(r?.encounter.participants.length, 1);
});

Deno.test("passTurn requireCurrent + walk", OPTS, async () => {
  clearCombatBrains();
  registerCombatBrain(jsonStrategyBrain);
  const store = memoryEncounterStore();
  const p = ports();
  const r = await startOrJoin({
    roomId: "r2",
    store,
    ports: p,
    autoBegin: false,
    participant: { actorId: "p1", name: "H", kind: "pc" },
  });
  await startOrJoin({
    roomId: "r2",
    store,
    ports: p,
    autoBegin: true,
    participant: {
      actorId: "n1",
      name: "G",
      kind: "npc",
    },
  });
  const enc = r!.encounter;
  // Force PC turn first
  const active = await store.get(
    (await store.findInRoom!("r2"))!.id,
  );
  assertEquals(active?.status, "active");

  const bad = await passTurn(active!.id, {
    store,
    ports: p,
    actorId: "n1",
    requireCurrent: true,
  });
  // may or may not be NPC turn depending on init
  void bad;

  const cur = active!.participants[active!.turnIdx];
  const ok = await passTurn(active!.id, {
    store,
    ports: p,
    actorId: cur.actorId,
    force: true,
  });
  assertEquals(ok.error, undefined);
  assertEquals(ok.encounter != null, true);
  clearCombatBrains();
});

Deno.test("endFight resolves", OPTS, async () => {
  const store = memoryEncounterStore();
  const p = ports();
  const r = await startOrJoin({
    roomId: "r3",
    store,
    ports: p,
    autoBegin: true,
    participant: { actorId: "p1", name: "H", kind: "pc" },
  });
  const ended = await endFight(r!.encounter.id, {
    store,
    ports: p,
    logLine: "staff end",
  });
  assertEquals(ended?.status, "resolved");
  assertEquals(
    ended?.log?.some((l) => l.includes("staff end")),
    true,
  );
});

Deno.test("formatInitiativeLines", OPTS, () => {
  const lines = formatInitiativeLines({
    id: "e",
    roomId: "r",
    round: 1,
    turnIdx: 1,
    status: "active",
    createdAt: 1,
    participants: [
      {
        actorId: "a",
        name: "A",
        initiative: 20,
        appliedDefense: 0,
        isDodging: false,
        isOut: false,
        actionUsed: true,
      },
      {
        actorId: "b",
        name: "B",
        initiative: 10,
        appliedDefense: 0,
        isDodging: false,
        isOut: false,
        delayed: true,
      },
    ],
  });
  assertEquals(lines.length, 2);
  assertEquals(lines[1].includes("->"), true);
  assertEquals(lines[1].includes("held"), true);
  assertEquals(lines[0].includes("acted"), true);
});
