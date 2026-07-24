import { assertEquals } from "@std/assert";
import type { Encounter, Participant } from "../src/types.ts";
import { appendEncounterLog } from "../src/types.ts";
import type { EncounterStore } from "../src/store.ts";
import { applyActionResult } from "../src/action-result.ts";
import { advanceTurnSmart } from "../src/walker.ts";
import type { CombatPorts } from "../src/ports.ts";
import {
  clearCombatBrains,
  jsonStrategyBrain,
  registerCombatBrain,
} from "../src/brains.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function part(
  id: string,
  kind: "pc" | "npc",
  init: number,
): Participant {
  return {
    actorId: id,
    name: id,
    initiative: init,
    appliedDefense: 0,
    isDodging: false,
    isOut: false,
    kind,
  };
}

function memStore(initial: Encounter): EncounterStore {
  let cur = structuredClone(initial);
  return {
    async get(id) {
      return cur.id === id ? structuredClone(cur) : null;
    },
    async create(enc) {
      cur = structuredClone(enc);
    },
    async save(enc) {
      cur = structuredClone(enc);
    },
    async advanceTurn(id) {
      if (cur.id !== id || cur.status !== "active") return cur;
      const n = cur.participants.length;
      let turnIdx = cur.turnIdx + 1;
      let round = cur.round;
      if (turnIdx >= n) {
        turnIdx = 0;
        round += 1;
      }
      cur = { ...cur, turnIdx, round };
      return structuredClone(cur);
    },
    async patchParticipant(eid, actorId, patch) {
      if (cur.id !== eid) return null;
      cur = {
        ...cur,
        participants: cur.participants.map((p) =>
          p.actorId === actorId ? { ...p, ...patch } : p
        ),
      };
      return structuredClone(cur);
    },
  };
}

Deno.test("appendEncounterLog caps length", OPTS, () => {
  let enc: Encounter = {
    id: "e1",
    roomId: "r",
    round: 1,
    turnIdx: 0,
    participants: [],
    status: "active",
    createdAt: 1,
  };
  for (let i = 0; i < 5; i++) {
    enc = appendEncounterLog(enc, `line ${i}`, 3);
  }
  assertEquals(enc.log?.length, 3);
  assertEquals(enc.log?.[0], "line 2");
});

Deno.test("applyActionResult threat + targetOut + log", OPTS, async () => {
  const store = memStore({
    id: "e1",
    roomId: "r",
    round: 1,
    turnIdx: 0,
    status: "active",
    createdAt: 1,
    participants: [
      part("npc1", "npc", 20),
      part("pc1", "pc", 10),
    ],
  });

  const { enc, endedTurn } = await applyActionResult(
    "e1",
    {
      ok: true,
      damageApplied: 5,
      targetId: "pc1",
      targetOut: true,
      logLine: "npc1 hits pc1",
    },
    {
      actorId: "npc1",
      action: { type: "attack", targetId: "pc1" },
      store,
    },
  );

  assertEquals(endedTurn, true);
  assertEquals(enc?.log?.[0], "npc1 hits pc1");
  const pc = enc?.participants.find((p) => p.actorId === "pc1");
  assertEquals(pc?.isOut, true);
  assertEquals(pc?.threat?.["npc1"], 5);
});

Deno.test("applyActionResult endedTurn false", OPTS, async () => {
  const store = memStore({
    id: "e1",
    roomId: "r",
    round: 1,
    turnIdx: 0,
    status: "active",
    createdAt: 1,
    participants: [part("npc1", "npc", 10)],
  });
  const { endedTurn } = await applyActionResult(
    "e1",
    { ok: true, endedTurn: false, logLine: "bonus" },
    {
      actorId: "npc1",
      action: { type: "wait" },
      store,
    },
  );
  assertEquals(endedTurn, false);
});

Deno.test(
  "walker: attack result with damageApplied sets threat",
  OPTS,
  async () => {
    clearCombatBrains();
    registerCombatBrain(jsonStrategyBrain);
    const store = memStore({
      id: "e1",
      roomId: "r",
      round: 1,
      turnIdx: 0,
      status: "active",
      createdAt: 1,
      maxRounds: 2,
      participants: [
        part("npc1", "npc", 20),
        part("pc1", "pc", 5),
      ],
    });

    const ports: CombatPorts = {
      async loadActor(id) {
        return {
          id,
          name: id,
          kind: id.startsWith("npc") ? "npc" : "pc",
          isOut: false,
          healthFrac: 1,
          aiKey: id.startsWith("npc") ? "aggressive" : undefined,
        };
      },
      async executeAction(_id, action) {
        if (action.type !== "attack") return { ok: true };
        return {
          ok: true,
          damageApplied: 4,
          targetId: action.targetId,
          logLine: `hit ${action.targetId}`,
        };
      },
      broadcast() {},
    };

    const after = await advanceTurnSmart("e1", { ports, store });
    // Should halt on PC turn after NPC acted
    assertEquals(after?.participants[after.turnIdx]?.kind, "pc");
    const pc = after?.participants.find((p) => p.actorId === "pc1");
    assertEquals(pc?.threat?.["npc1"], 4);
    assertEquals(after?.log?.some((l) => l.includes("hit")), true);
    clearCombatBrains();
  },
);

Deno.test("richer attack action with mode is accepted", OPTS, async () => {
  const store = memStore({
    id: "e1",
    roomId: "r",
    round: 1,
    turnIdx: 0,
    status: "active",
    createdAt: 1,
    maxRounds: 1,
    participants: [
      part("npc1", "npc", 20),
      part("pc1", "pc", 5),
    ],
  });
  let sawMode: string | undefined;
  const ports: CombatPorts = {
    async loadActor(id) {
      return {
        id,
        name: id,
        kind: id.startsWith("npc") ? "npc" : "pc",
        isOut: false,
        healthFrac: 1,
        aiKey: "manual",
      };
    },
    async executeAction(_id, action) {
      if (action.type === "attack") sawMode = action.mode;
      return { ok: true };
    },
    broadcast() {},
  };
  // manual AI → walker returns without execute
  await advanceTurnSmart("e1", { ports, store });
  assertEquals(sawMode, undefined);

  // Direct result path via applyActionResult with mode action
  await applyActionResult(
    "e1",
    { ok: true, logLine: "aimed shot" },
    {
      actorId: "npc1",
      action: {
        type: "attack",
        targetId: "pc1",
        mode: "aimed",
        weaponId: "rifle",
      },
      store,
    },
  );
  const enc = await store.get("e1");
  assertEquals(enc?.log?.includes("aimed shot"), true);
});

Deno.test("Encounter startedBy meta log fields round-trip", OPTS, () => {
  const enc: Encounter = {
    id: "e",
    roomId: "r",
    round: 1,
    turnIdx: 0,
    participants: [],
    status: "active",
    createdAt: 1,
    startedBy: "pc1",
    log: ["start"],
    meta: { system: "cpr" },
  };
  assertEquals(enc.startedBy, "pc1");
  assertEquals(enc.meta?.system, "cpr");
  const withLog = appendEncounterLog(enc, "round 1");
  assertEquals(withLog.log?.length, 2);
});
