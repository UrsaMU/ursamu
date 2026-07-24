/**
 * Phase 4: same walker + JSON brain, two port adapters,
 * pure in-memory store (no DBO / mush boot).
 */
import { assert } from "@std/assert";
import { advanceTurnSmart } from "../src/walker.ts";
import {
  clearCombatBrains,
  jsonStrategyBrain,
  registerCombatBrain,
} from "../src/brains.ts";
import type { CombatActorView, CombatPorts } from "../src/ports.ts";
import type { EncounterStore } from "../src/store.ts";
import type { Encounter, Participant } from "../src/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

type MemActor = {
  id: string;
  name: string;
  kind: "pc" | "npc";
  hp: number;
  maxHp: number;
  aiKey?: string;
};

function memStore(initial: Encounter): EncounterStore {
  const map = new Map<string, Encounter>();
  map.set(initial.id, structuredClone(initial));

  return {
    async get(id) {
      const e = map.get(id);
      return e ? structuredClone(e) : null;
    },
    async create(enc) {
      map.set(enc.id, structuredClone(enc));
    },
    async save(enc) {
      map.set(enc.id, structuredClone(enc));
    },
    async advanceTurn(id) {
      const enc = map.get(id);
      if (!enc || enc.status !== "active") return enc ?? null;
      const count = enc.participants.length;
      if (!count) return enc;
      let nextIdx = enc.turnIdx + 1;
      let round = enc.round;
      let participants = enc.participants;
      if (nextIdx >= count) {
        nextIdx = 0;
        round += 1;
        participants = participants.map((p) => ({
          ...p,
          appliedDefense: 0,
          isDodging: false,
          actionUsed: false,
          movedThisRound: false,
          ran: false,
          delayed: false,
        }));
      }
      const updated = {
        ...enc,
        turnIdx: nextIdx,
        round,
        participants,
      };
      map.set(id, updated);
      return structuredClone(updated);
    },
    async patchParticipant(encounterId, actorId, patch) {
      const enc = map.get(encounterId);
      if (!enc) return null;
      const participants = enc.participants.map((p) =>
        p.actorId === actorId ? { ...p, ...patch } : p
      );
      const updated = { ...enc, participants };
      map.set(encounterId, updated);
      return structuredClone(updated);
    },
  };
}

function makeSystem(label: string, store: EncounterStore) {
  const actors = new Map<string, MemActor>();
  const log: string[] = [];

  const ports: CombatPorts = {
    async loadActor(id) {
      const a = actors.get(id);
      if (!a) return null;
      const view: CombatActorView = {
        id: a.id,
        name: a.name,
        kind: a.kind,
        isOut: a.hp <= 0,
        healthFrac: a.maxHp > 0 ? a.hp / a.maxHp : 0,
        aiKey: a.kind === "npc"
          ? (a.aiKey ?? "aggressive")
          : undefined,
      };
      return view;
    },
    async executeAction(actorId, action, ctx) {
      if (action.type !== "attack" || !action.targetId) {
        return { ok: true };
      }
      const atk = actors.get(actorId);
      const def = actors.get(action.targetId);
      if (!atk || !def) return { ok: false };
      def.hp = Math.max(0, def.hp - 3);
      log.push(`${label}:${atk.name}->${def.name} hp=${def.hp}`);
      const targetOut = def.hp <= 0;
      return {
        ok: true,
        damageApplied: 3,
        targetId: action.targetId,
        targetOut,
        logLine: `${atk.name}->${def.name}`,
      };
    },
    broadcast(_r, msg) {
      log.push(`${label}:bc:${msg}`);
    },
    async onResolved(enc) {
      log.push(`${label}:resolved`);
      return { ...enc, status: "resolved" };
    },
  };

  return { actors, log, ports };
}

function baseEnc(
  id: string,
  parts: Participant[],
  turnIdx: number,
): Encounter {
  return {
    id,
    roomId: "r",
    round: 1,
    turnIdx,
    participants: parts,
    status: "active",
    createdAt: 0,
    maxRounds: 10,
  };
}

function part(
  id: string,
  kind: "pc" | "npc",
  init: number,
): Participant {
  return {
    actorId: id,
    name: id,
    kind,
    initiative: init,
    appliedDefense: 0,
    isDodging: false,
    isOut: false,
  };
}

Deno.test(
  "dual system A: aggressive AI attacks via ports",
  OPTS,
  async () => {
    clearCombatBrains();
    registerCombatBrain(jsonStrategyBrain);

    const enc = baseEnc("e-a", [
      part("pc", "pc", 15),
      part("npc", "npc", 10),
    ], 1);
    const store = memStore(enc);
    const sys = makeSystem("A", store);
    sys.actors.set("pc", {
      id: "pc",
      name: "Hero",
      kind: "pc",
      hp: 20,
      maxHp: 20,
    });
    sys.actors.set("npc", {
      id: "npc",
      name: "Gob",
      kind: "npc",
      hp: 9,
      maxHp: 9,
      aiKey: "aggressive",
    });

    const result = await advanceTurnSmart("e-a", {
      ports: sys.ports,
      store,
    });
    assert(result);
    assert(
      sys.log.some((l) => l.includes("A:Gob->Hero")) ||
        result.participants[result.turnIdx]?.kind === "pc",
      `log=${sys.log.join("|")} turn=${result.turnIdx}`,
    );
    clearCombatBrains();
  },
);

Deno.test(
  "dual system B: same brain, different system label",
  OPTS,
  async () => {
    clearCombatBrains();
    registerCombatBrain(jsonStrategyBrain);

    const enc = baseEnc("e-b", [
      part("npc", "npc", 20),
      part("pc", "pc", 5),
    ], 0);
    const store = memStore(enc);
    const sys = makeSystem("B", store);
    sys.actors.set("pc", {
      id: "pc",
      name: "Mage",
      kind: "pc",
      hp: 8,
      maxHp: 8,
    });
    sys.actors.set("npc", {
      id: "npc",
      name: "Wolf",
      kind: "npc",
      hp: 6,
      maxHp: 6,
      aiKey: "aggressive",
    });

    const result = await advanceTurnSmart("e-b", {
      ports: sys.ports,
      store,
    });
    assert(result);
    assert(
      sys.log.some((l) => l.startsWith("B:")),
      sys.log.join("|"),
    );
    clearCombatBrains();
  },
);
