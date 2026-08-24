/**
 * Walker-backed +combat start / attack / pass / end.
 */
import { assertEquals, assert } from "@std/assert";
import {
  beginEncounter,
  currentActor,
  joinEncounter,
  startEncounter,
} from "@ursamu/combat";
import {
  dndEncounterStore,
  initDndCombat,
  makeDndPorts,
  removeDndCombat,
} from "../src/combat/ports.ts";
import { advanceTurnSmart } from "../src/combat/walker.ts";
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
        search: (q: Record<string, unknown>) => {
          if (q.id) {
            const o = map.get(String(q.id));
            return Promise.resolve(o ? [o] : []);
          }
          if (q.location) {
            return Promise.resolve(
              [...map.values()].filter(
                (o) => o.location === q.location,
              ),
            );
          }
          return Promise.resolve([...map.values()]);
        },
        modify: (
          id: string,
          _op: string,
          data: Record<string, unknown>,
        ) => {
          const o = map.get(id);
          if (!o) return Promise.resolve();
          for (const [k, v] of Object.entries(data)) {
            if (k === "data.dnd") {
              o.state = { ...o.state, dnd: v };
            } else if (k === "location") {
              o.location = String(v);
            }
          }
          return Promise.resolve();
        },
        create: (tmpl: Partial<Obj>) => {
          const id = `obj-${map.size + 1}`;
          const o = {
            id,
            name: tmpl.name ?? id,
            flags: tmpl.flags ?? new Set(["thing"]),
            location: tmpl.location ?? "",
            contents: [],
            state: tmpl.state ?? {},
          } as Obj;
          map.set(id, o);
          return Promise.resolve(o);
        },
        destroy: (id: string) => {
          map.delete(id);
          return Promise.resolve();
        },
      };
    },
  };
}

function seed(
  store: ReturnType<typeof makeStore>,
  id: string,
  name: string,
  kind: "pc" | "npc",
  hp = 20,
) {
  const sheet = defaultSheet();
  sheet.hp = { max: hp, current: hp, temp: 0 };
  sheet.ac = kind === "npc" ? 10 : 14;
  if (kind === "npc") {
    sheet.class = "Monster";
    // deno-lint-ignore no-explicit-any
    (sheet as any).aiKey = "aggressive";
  }
  sheet.abilities.strength = 16;
  sheet.abilities.dexterity = 14;
  const flags = new Set(
    kind === "npc"
      ? ["npc", "thing"]
      : ["player", "connected"],
  );
  return store.put({
    id,
    name,
    flags,
    location: "room1",
    contents: [],
    state: { dnd: sheet, name },
  } as Obj);
}

function mockU(
  store: ReturnType<typeof makeStore>,
  meId: string,
): IUrsamuSDK & { _msgs: string[] } {
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
    broadcast: (m: string) => {
      msgs.push(m);
    },
    util: {
      stripSubs: (s: string) => s,
      displayName: (o: { name?: string }) =>
        (o.name ?? "?").split(";")[0],
      ljust: (s: string, w: number) => s.padEnd(w),
      target: async (_a: unknown, q: string) => {
        const low = q.toLowerCase();
        for (const o of store.map.values()) {
          if (
            o.name?.toLowerCase().includes(low) ||
            o.id === q
          ) {
            return o;
          }
        }
        return null;
      },
    },
    cmd: { name: "", original: "", args: [], switches: [] },
    _msgs: msgs,
  } as unknown as IUrsamuSDK & { _msgs: string[] };
}

Deno.test(
  "combat start → begin → NPC walker halts on PC",
  OPTS,
  async () => {
    removeDndCombat();
    initDndCombat();
    const store = makeStore();
    seed(store, "pc1", "Hero", "pc", 30);
    seed(store, "n1", "Goblin", "npc", 7);

    let enc = await startEncounter("room1", {
      store: dndEncounterStore,
    });
    const u = mockU(store, "pc1");
    const ports = makeDndPorts(u);

    enc = (await joinEncounter(enc.id, {
      actorId: "pc1",
      name: "Hero",
      kind: "pc",
    }, { store: dndEncounterStore, ports }))!;
    enc = (await joinEncounter(enc.id, {
      actorId: "n1",
      name: "Goblin",
      kind: "npc",
    }, { store: dndEncounterStore, ports }))!;

    enc = (await beginEncounter(enc.id, {
      store: dndEncounterStore,
      ports,
    }))!;
    assertEquals(enc.status, "active");
    assert(enc.participants.length === 2);

    // Force goblin first so walker runs.
    enc = {
      ...enc,
      turnIdx: enc.participants.findIndex(
        (p) => p.actorId === "n1",
      ),
    };
    await dndEncounterStore.save(enc);

    const after = await advanceTurnSmart(enc.id, u);
    assert(after);
    if (after.status === "active") {
      const cur = currentActor(after);
      assert(cur);
      // Should land on PC or still be resolving.
      assert(
        cur.kind === "pc" || after.participants.every(
          (p) => p.kind === "npc" ? p.isOut : true,
        ),
      );
    }
    removeDndCombat();
  },
);

Deno.test(
  "PC attack via ports marks damage on NPC",
  OPTS,
  async () => {
    removeDndCombat();
    initDndCombat();
    const store = makeStore();
    seed(store, "pc1", "Hero", "pc", 30);
    const gob = seed(store, "n1", "Goblin", "npc", 5);
    // deno-lint-ignore no-explicit-any
    (gob.state.dnd as any).ac = 5;

    const u = mockU(store, "pc1");
    const ports = makeDndPorts(u);
    let enc = await startEncounter("room1", {
      store: dndEncounterStore,
    });
    await joinEncounter(enc.id, {
      actorId: "pc1",
      name: "Hero",
      kind: "pc",
    }, { store: dndEncounterStore, ports });
    await joinEncounter(enc.id, {
      actorId: "n1",
      name: "Goblin",
      kind: "npc",
    }, { store: dndEncounterStore, ports });
    enc = (await beginEncounter(enc.id, {
      store: dndEncounterStore,
      ports,
    }))!;

    // Put PC on turn
    const pcIdx = enc.participants.findIndex(
      (p) => p.actorId === "pc1",
    );
    enc = { ...enc, turnIdx: pcIdx };
    await dndEncounterStore.save(enc);

    const slot = enc.participants.find(
      (p) => p.actorId === "n1",
    )!;
    const before = // deno-lint-ignore no-explicit-any
      ((store.map.get("n1")!.state as any).dnd.hp.current as number);

    let hit = false;
    for (let i = 0; i < 15; i++) {
      const r = await ports.executeAction("pc1", {
        type: "attack",
        targetId: "n1",
      }, {
        encounter: enc,
        actor: {
          id: "pc1",
          name: "Hero",
          kind: "pc",
          isOut: false,
          healthFrac: 1,
        },
        participant: enc.participants[pcIdx],
      });
      if (r.damageApplied && r.damageApplied > 0) {
        hit = true;
        break;
      }
    }
    assert(hit, "expected at least one hit in 15 tries");
    // deno-lint-ignore no-explicit-any
    const after = (store.map.get("n1")!.state as any).dnd.hp
      .current as number;
    assert(after < before, `hp ${after} should be < ${before}`);
    void slot;
    removeDndCombat();
  },
);
