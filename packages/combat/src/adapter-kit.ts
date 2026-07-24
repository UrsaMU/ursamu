/**
 * Shared smoke suite for game-system combat adapters.
 * Call from each package's tests with its store + ports factory.
 */
import type { Encounter, Participant } from "./types.ts";
import type { CombatPorts, CombatActorView } from "./ports.ts";
import type { EncounterStore } from "./store.ts";
import {
  beginEncounter,
  endEncounter,
  joinEncounter,
  startEncounter,
} from "./lifecycle.ts";
import { advanceTurnSmart } from "./walker.ts";
import {
  clearCombatBrains,
  jsonStrategyBrain,
  registerCombatBrain,
} from "./brains.ts";
import { passTurn, startOrJoin, endFight } from "./turn-helpers.ts";

export interface AdapterKitActor {
  id: string;
  name: string;
  kind: "pc" | "npc";
  hp: number;
  maxHp: number;
  aiKey?: string;
}

export interface AdapterKitHooks {
  actors: Map<string, AdapterKitActor>;
  log: string[];
}

export interface AdapterSmokeOptions {
  store: EncounterStore;
  /**
   * Build ports bound to hooks (actors mutate on attack).
   * If omitted, a minimal default ports is used.
   */
  makePorts?: (hooks: AdapterKitHooks) => CombatPorts;
  label?: string;
}

export interface AdapterSmokeResult {
  ok: boolean;
  errors: string[];
  log: string[];
}

function defaultPorts(hooks: AdapterKitHooks): CombatPorts {
  return {
    async loadActor(id) {
      const a = hooks.actors.get(id);
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
        tags: a.hp < a.maxHp * 0.25 ? ["critical"] : [],
        resources: { ammo: 10 },
      };
      return view;
    },
    async executeAction(actorId, action) {
      if (action.type !== "attack" || !action.targetId) {
        return { ok: true, endedTurn: true };
      }
      const atk = hooks.actors.get(actorId);
      const def = hooks.actors.get(action.targetId);
      if (!atk || !def) return { ok: false, message: "missing" };
      def.hp = Math.max(0, def.hp - 5);
      hooks.log.push(`${atk.name}->${def.name} hp=${def.hp}`);
      return {
        ok: true,
        damageApplied: 5,
        targetId: def.id,
        targetOut: def.hp <= 0,
        logLine: `${atk.name} hits ${def.name}`,
      };
    },
    broadcast(_r, msg) {
      hooks.log.push(`bc:${msg}`);
    },
    async rollInitiative(id) {
      const a = hooks.actors.get(id);
      return a?.kind === "npc" ? 8 : 15;
    },
    async onResolved(enc) {
      hooks.log.push("resolved");
      return { ...enc, status: "resolved" };
    },
  };
}

function part(
  a: AdapterKitActor,
  init: number,
): Participant {
  return {
    actorId: a.id,
    name: a.name,
    initiative: init,
    appliedDefense: 0,
    isDodging: false,
    isOut: a.hp <= 0,
    kind: a.kind,
  };
}

/**
 * Five smokes every adapter should pass:
 * 1. startOrJoin creates + joins
 * 2. begin sorts PC first when higher init
 * 3. walker NPC attacks then halts on PC
 * 4. all NPCs out → onResolved
 * 5. manual AI does not auto-act
 */
export async function runAdapterSmoke(
  opts: AdapterSmokeOptions,
): Promise<AdapterSmokeResult> {
  const errors: string[] = [];
  const hooks: AdapterKitHooks = {
    actors: new Map(),
    log: [],
  };
  const label = opts.label ?? "adapter";

  clearCombatBrains();
  registerCombatBrain(jsonStrategyBrain);

  const ports = opts.makePorts
    ? opts.makePorts(hooks)
    : defaultPorts(hooks);
  const store = opts.store;

  try {
    // --- 1 startOrJoin ---
    const pc: AdapterKitActor = {
      id: "pc1",
      name: "Hero",
      kind: "pc",
      hp: 20,
      maxHp: 20,
    };
    const npc: AdapterKitActor = {
      id: "npc1",
      name: "Goblin",
      kind: "npc",
      hp: 10,
      maxHp: 10,
      aiKey: "aggressive",
    };
    hooks.actors.set(pc.id, pc);
    hooks.actors.set(npc.id, npc);

    const sj = await startOrJoin({
      roomId: `room-${label}`,
      store,
      ports,
      startedBy: pc.id,
      participant: {
        actorId: pc.id,
        name: pc.name,
        kind: "pc",
      },
      logLine: "fight starts",
    });
    if (!sj?.created) errors.push("startOrJoin did not create");
    if (!sj?.joined && !sj?.encounter.participants.length) {
      errors.push("startOrJoin missing participant");
    }

    await joinEncounter(
      sj!.encounter.id,
      { actorId: npc.id, name: npc.name, kind: "npc" },
      { store, ports },
    );

    // --- 2 begin ---
    const active = await beginEncounter(sj!.encounter.id, {
      store,
      ports,
    });
    if (active?.status !== "active") {
      errors.push("beginEncounter did not activate");
    }
    if (active && active.participants[0]?.actorId !== pc.id) {
      // PC rolled 15, NPC 8
      errors.push("expected PC higher init first");
    }

    // --- 3 walker after pass ---
    // Put NPC first so walker runs
    if (active) {
      const reordered: Encounter = {
        ...active,
        turnIdx: active.participants.findIndex(
          (p) => p.actorId === npc.id,
        ),
        participants: active.participants.map((p) =>
          p.actorId === npc.id
            ? { ...p, initiative: 20 }
            : { ...p, initiative: 5 }
        ),
      };
      // sort for display consistency
      reordered.participants.sort(
        (a, b) => b.initiative - a.initiative,
      );
      reordered.turnIdx = 0;
      await store.save(reordered);

      const after = await advanceTurnSmart(reordered.id, {
        ports,
        store,
      });
      if (!after) errors.push("walker returned null");
      else if (after.participants[after.turnIdx]?.kind !== "pc") {
        errors.push("walker did not halt on PC");
      }
      const hero = hooks.actors.get(pc.id)!;
      if (hero.hp >= 20) {
        errors.push("NPC attack did not damage PC");
      }
    }

    // --- 4 all NPCs out → resolve ---
    const enc2 = await startEncounter(`room-${label}-2`, {
      store,
    });
    hooks.actors.set("pc2", {
      id: "pc2",
      name: "Hero2",
      kind: "pc",
      hp: 20,
      maxHp: 20,
    });
    hooks.actors.set("npc2", {
      id: "npc2",
      name: "Gob2",
      kind: "npc",
      hp: 0,
      maxHp: 10,
      aiKey: "aggressive",
    });
    await joinEncounter(
      enc2.id,
      part(hooks.actors.get("pc2")!, 10),
      { store },
    );
    await joinEncounter(
      enc2.id,
      { ...part(hooks.actors.get("npc2")!, 20), isOut: true },
      { store },
    );
    let e2 = await store.get(enc2.id);
    if (e2) {
      e2 = {
        ...e2,
        status: "active",
        turnIdx: 0,
        participants: e2.participants.map((p) =>
          p.actorId === "npc2" ? { ...p, isOut: true } : p
        ),
      };
      await store.save(e2);
      const resolved = await advanceTurnSmart(e2.id, {
        ports,
        store,
      });
      if (resolved?.status !== "resolved") {
        errors.push("expected onResolved when all NPCs out");
      }
      if (!hooks.log.includes("resolved")) {
        errors.push("onResolved log missing");
      }
    }

    // --- 5 manual AI halts ---
    const enc3 = await startEncounter(`room-${label}-3`, {
      store,
    });
    hooks.actors.set("pc3", {
      id: "pc3",
      name: "H3",
      kind: "pc",
      hp: 20,
      maxHp: 20,
    });
    hooks.actors.set("npc3", {
      id: "npc3",
      name: "Manual",
      kind: "npc",
      hp: 10,
      maxHp: 10,
      aiKey: "manual",
    });
    await joinEncounter(
      enc3.id,
      part(hooks.actors.get("npc3")!, 20),
      { store },
    );
    await joinEncounter(
      enc3.id,
      part(hooks.actors.get("pc3")!, 5),
      { store },
    );
    let e3 = await store.get(enc3.id);
    if (e3) {
      e3 = { ...e3, status: "active", turnIdx: 0 };
      await store.save(e3);
      const hpBefore = hooks.actors.get("pc3")!.hp;
      const halted = await advanceTurnSmart(e3.id, {
        ports,
        store,
      });
      if (halted?.turnIdx !== 0) {
        errors.push("manual AI should not advance turn");
      }
      if (hooks.actors.get("pc3")!.hp !== hpBefore) {
        errors.push("manual AI should not attack");
      }
    }

    // --- bonus: passTurn + endFight ---
    const enc4 = await startEncounter(`room-${label}-4`, {
      store,
      startedBy: "pc4",
    });
    hooks.actors.set("pc4", {
      id: "pc4",
      name: "H4",
      kind: "pc",
      hp: 20,
      maxHp: 20,
    });
    hooks.actors.set("npc4", {
      id: "npc4",
      name: "G4",
      kind: "npc",
      hp: 10,
      maxHp: 10,
      aiKey: "aggressive",
    });
    await joinEncounter(
      enc4.id,
      part(hooks.actors.get("pc4")!, 15),
      { store },
    );
    await joinEncounter(
      enc4.id,
      part(hooks.actors.get("npc4")!, 5),
      { store },
    );
    await beginEncounter(enc4.id, { store, ports });
    const passed = await passTurn(enc4.id, {
      store,
      ports,
      actorId: "pc4",
    });
    if (passed.error) {
      errors.push(`passTurn error: ${passed.error}`);
    }
    const ended = await endFight(enc4.id, { store, ports });
    if (ended?.status !== "resolved") {
      errors.push("endFight did not resolve");
    }

    // silence unused
    void endEncounter;
  } catch (e: unknown) {
    errors.push(
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    clearCombatBrains();
  }

  return {
    ok: errors.length === 0,
    errors,
    log: hooks.log,
  };
}

/** In-memory store for kit / unit tests. */
export function memoryEncounterStore(
  seed?: Encounter[],
): EncounterStore {
  const map = new Map<string, Encounter>();
  for (const e of seed ?? []) map.set(e.id, structuredClone(e));

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
    async findInRoom(roomId) {
      const rows = [...map.values()].filter(
        (e) =>
          e.roomId === roomId &&
          (e.status === "intent" || e.status === "active"),
      );
      return (
        rows.find((e) => e.status === "active") ??
          rows[0] ??
          null
      );
    },
    async advanceTurn(id) {
      const enc = map.get(id);
      if (!enc || enc.status !== "active") return enc ?? null;
      const n = enc.participants.length;
      if (!n) return enc;
      let turnIdx = enc.turnIdx + 1;
      let round = enc.round;
      let participants = enc.participants;
      if (turnIdx >= n) {
        turnIdx = 0;
        round += 1;
        participants = participants.map((p) => ({
          ...p,
          actionUsed: false,
          delayed: false,
        }));
      }
      const next = { ...enc, turnIdx, round, participants };
      map.set(id, next);
      return structuredClone(next);
    },
    async patchParticipant(eid, actorId, patch) {
      const enc = map.get(eid);
      if (!enc) return null;
      const participants = enc.participants.map((p) =>
        p.actorId === actorId ? { ...p, ...patch } : p
      );
      const next = { ...enc, participants };
      map.set(eid, next);
      return structuredClone(next);
    },
  };
}
