/**
 * Phase 4 proof: D&D CombatPorts drive @ursamu/combat walker
 * with zero CofD imports.
 */
import { assertEquals, assert } from "@std/assert";
import { advanceTurnSmart } from "../src/combat/walker.ts";
import {
  addDndParticipant,
  createDndEncounter,
  dndEncounterDb,
  initDndCombat,
} from "../src/combat/ports.ts";
import { defaultSheet } from "../src/stats/dnd_sheet.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

type Obj = IDBObj & { state: Record<string, unknown> };

function makeStore() {
  const map = new Map<string, Obj>();
  return {
    map,
    put(o: Obj) {
      map.set(o.id, o);
      return o;
    },
    asDb() {
      return {
        search: async (q: Record<string, unknown>) => {
          if (q.id) {
            const o = map.get(String(q.id));
            return o ? [o] : [];
          }
          return [...map.values()];
        },
        modify: async (
          id: string,
          _op: string,
          data: Record<string, unknown>,
        ) => {
          const o = map.get(id);
          if (!o) return;
          for (const [k, v] of Object.entries(data)) {
            if (k === "data.dnd") {
              o.state = { ...o.state, dnd: v };
            }
          }
        },
        destroy: async (id: string) => {
          map.delete(id);
        },
      };
    },
  };
}

function seed(
  store: ReturnType<typeof makeStore>,
  id: string,
  name: string,
  isNpc: boolean,
  hp = 10,
) {
  const sheet = defaultSheet();
  sheet.hp = { max: hp, current: hp, temp: 0 };
  sheet.ac = isNpc ? 10 : 16;
  sheet.abilities.strength = isNpc ? 14 : 16;
  // deno-lint-ignore no-explicit-any
  (sheet as any).aiKey = isNpc ? "aggressive" : undefined;
  const flags = new Set(
    isNpc
      ? ["npc", "thing"]
      : ["player", "connected"],
  );
  return store.put({
    id,
    name,
    flags,
    location: "room1",
    contents: [],
    state: {
      dnd: {
        ...sheet,
        aiKey: isNpc ? "aggressive" : undefined,
      },
    },
  } as Obj);
}

function mockU(
  store: ReturnType<typeof makeStore>,
  meId: string,
): IUrsamuSDK {
  const msgs: string[] = [];
  const me = store.map.get(meId)!;
  return {
    me,
    here: {
      id: "room1",
      broadcast: (m: string) => {
        msgs.push(m);
      },
    },
    db: store.asDb(),
    send: (m: string) => {
      msgs.push(m);
    },
    util: {
      stripSubs: (s: string) => s,
      displayName: (o: { name?: string }) => o.name ?? "?",
    },
    cmd: { name: "", original: "", args: [], switches: [] },
    _msgs: msgs,
  } as unknown as IUrsamuSDK & { _msgs: string[] };
}

Deno.test(
  "dnd walker: NPCs use aggressive AI then halt on PC",
  OPTS,
  async () => {
    initDndCombat();
    const store = makeStore();
    seed(store, "pc1", "Hero", false, 20);
    seed(store, "n1", "Goblin", true, 7);
    seed(store, "pc2", "Ally", false, 20);

    const enc = await createDndEncounter("room1");
    for (const id of ["pc1", "n1", "pc2"]) {
      await addDndParticipant(enc.id, store.map.get(id)!, 10);
    }
    // deno-lint-ignore no-explicit-any
    const fresh = await dndEncounterDb.findOne({ id: enc.id } as any);
    assert(fresh);
    // deno-lint-ignore no-explicit-any
    await dndEncounterDb.update({ id: enc.id } as any, {
      ...fresh,
      status: "active",
      turnIdx: 1, // goblin's turn
      round: 1,
    });

    const u = mockU(store, "pc1");
    const result = await advanceTurnSmart(enc.id, u);
    assert(result);
    // After goblin acts, should land on pc2 (or still walk).
    const cur = result.participants[result.turnIdx];
    assert(cur);
    // Either halted on a PC, or resolved if goblin somehow ended fight.
    if (result.status === "active") {
      assertEquals(cur.kind, "pc");
    }
  },
);

Deno.test(
  "dnd ports: attack can drop NPC to 0 HP",
  OPTS,
  async () => {
    initDndCombat();
    const store = makeStore();
    // Glass-cannon PC, 1 HP goblin.
    seed(store, "pc1", "Hero", false, 30);
    const gob = seed(store, "n1", "Goblin", true, 1);
    gob.state.dnd = {
      ...defaultSheet(),
      hp: { max: 1, current: 1, temp: 0 },
      ac: 5,
      abilities: {
        ...defaultSheet().abilities,
        strength: 3,
        dexterity: 3,
      },
    };

    const enc = await createDndEncounter("room-atk");
    await addDndParticipant(enc.id, store.map.get("pc1")!, 20);
    await addDndParticipant(enc.id, store.map.get("n1")!, 5);
    // deno-lint-ignore no-explicit-any
    const fresh = await dndEncounterDb.findOne({ id: enc.id } as any);
    // deno-lint-ignore no-explicit-any
    await dndEncounterDb.update({ id: enc.id } as any, {
      ...fresh!,
      status: "active",
      turnIdx: 0,
      round: 1,
    });

    const u = mockU(store, "pc1");
    // Force many NPC turns until goblin dies or safety.
    // Start on goblin... set turn to goblin after pc
    // Actually start with goblin turn and weak goblin attacking - won't die.
    // Start PC turn... walker on PC halts. So call ports attack directly.
    const { makeDndPorts } = await import("../src/combat/ports.ts");
    const ports = makeDndPorts(u);
    // deno-lint-ignore no-explicit-any
    const enc2 = await dndEncounterDb.findOne({ id: enc.id } as any);
    assert(enc2);
    // PC attacks goblin until dead (bounded).
    for (let i = 0; i < 20; i++) {
      const g = store.map.get("n1");
      // deno-lint-ignore no-explicit-any
      const hp = (g?.state as any)?.dnd?.hp?.current ?? 0;
      if (hp <= 0) break;
      await ports.executeAction("pc1", {
        type: "attack",
        targetId: "n1",
      }, {
        encounter: enc2,
        actor: {
          id: "pc1",
          name: "Hero",
          kind: "pc",
          isOut: false,
          healthFrac: 1,
        },
        participant: enc2.participants[0],
      });
    }
    // deno-lint-ignore no-explicit-any
    const hpLeft = (store.map.get("n1")?.state as any)?.dnd?.hp
      ?.current;
    // With AC 5 and many attacks, goblin should be down.
    assert(
      typeof hpLeft === "number" && hpLeft <= 0,
      `expected goblin dead, hp=${hpLeft}`,
    );
  },
);
