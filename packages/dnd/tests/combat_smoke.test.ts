/**
 * Adapter smoke + end-to-end walker path for D&D combat.
 */
import { assertEquals, assert } from "@std/assert";
import {
  beginEncounter,
  currentActor,
  endFight,
  joinEncounter,
  memoryEncounterStore,
  passTurn,
  runAdapterSmoke,
  startEncounter,
  startOrJoin,
} from "@ursamu/combat";
import {
  initDndCombat,
  makeDndPorts,
  removeDndCombat,
} from "../src/combat/ports.ts";
import { defaultSheet } from "../src/stats/dnd_sheet.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

type Obj = IDBObj & { state: Record<string, unknown> };

function liveWorld() {
  const map = new Map<string, Obj>();
  const put = (
    id: string,
    name: string,
    kind: "pc" | "npc",
    hp: number,
  ) => {
    const sheet = defaultSheet();
    sheet.hp = { max: hp, current: hp, temp: 0 };
    sheet.ac = kind === "npc" ? 10 : 14;
    if (kind === "npc") {
      sheet.class = "Monster";
      // deno-lint-ignore no-explicit-any
      (sheet as any).aiKey = "aggressive";
      // deno-lint-ignore no-explicit-any
      (sheet as any).xp = 50;
    }
    sheet.abilities.strength = 16;
    sheet.abilities.dexterity = 14;
    const o = {
      id,
      name,
      flags: new Set(
        kind === "npc"
          ? ["npc", "thing"]
          : ["player", "connected"],
      ),
      location: "room-smoke",
      contents: [],
      state: { name, dnd: sheet },
    } as Obj;
    map.set(id, o);
    return o;
  };

  const db = {
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
      if (data["data.dnd"]) {
        o.state = { ...o.state, dnd: data["data.dnd"] };
      }
      return Promise.resolve();
    },
  };

  const msgs: string[] = [];
  const u = {
    me: null as unknown as Obj,
    here: {
      id: "room-smoke",
      broadcast: (m: string) => msgs.push(m),
    },
    db,
    send: (m: string) => msgs.push(m),
    broadcast: (m: string) => msgs.push(m),
    util: {
      stripSubs: (s: string) => s,
      displayName: (o: { name?: string }) =>
        (o.name ?? "?").split(";")[0],
      ljust: (s: string, w: number) => s.padEnd(w),
    },
    cmd: { name: "", original: "", args: [], switches: [] },
    _msgs: msgs,
  } as unknown as IUrsamuSDK & { _msgs: string[]; me: Obj };

  return { map, put, u, msgs };
}

Deno.test("dnd runAdapterSmoke (memory store)", OPTS, async () => {
  removeDndCombat();
  // Pure adapter kit — no DBO; proves ports shape vs combat helpers.
  const store = memoryEncounterStore();
  const result = await runAdapterSmoke({
    store,
    label: "dnd",
    makePorts: (hooks) => ({
      async loadActor(id) {
        const a = hooks.actors.get(id);
        if (!a) return null;
        return {
          id: a.id,
          name: a.name,
          kind: a.kind,
          isOut: a.hp <= 0,
          healthFrac: a.maxHp > 0 ? a.hp / a.maxHp : 0,
          aiKey: a.kind === "npc"
            ? (a.aiKey ?? "aggressive")
            : undefined,
        };
      },
      executeAction(actorId, action) {
        if (action.type !== "attack" || !action.targetId) {
          return Promise.resolve({ ok: true, endedTurn: true });
        }
        const atk = hooks.actors.get(actorId);
        const def = hooks.actors.get(action.targetId);
        if (!atk || !def) {
          return Promise.resolve({ ok: false });
        }
        def.hp = Math.max(0, def.hp - 5);
        hooks.log.push(`${atk.name}->${def.name}`);
        return Promise.resolve({
          ok: true,
          damageApplied: 5,
          targetId: def.id,
          targetOut: def.hp <= 0,
          logLine: `${atk.name} hits ${def.name}`,
          endedTurn: true,
        });
      },
      broadcast(_r, msg) {
        hooks.log.push(`bc:${msg}`);
      },
      rollInitiative(id) {
        const a = hooks.actors.get(id);
        return Promise.resolve(a?.kind === "npc" ? 8 : 15);
      },
      onResolved(enc) {
        // Adapter kit expects resolve when all NPCs are out.
        hooks.log.push("resolved");
        return Promise.resolve({
          ...enc,
          status: "resolved" as const,
        });
      },
    }),
  });
  assertEquals(result.ok, true, result.errors.join("; "));
});

Deno.test(
  "dnd e2e: start → attack → pass → kill ends fight",
  OPTS,
  async () => {
    removeDndCombat();
    initDndCombat();
    const w = liveWorld();
    const pc = w.put("pc1", "Hero", "pc", 40);
    const npc = w.put("n1", "Goblin", "npc", 3);
    w.u.me = pc;

    const ports = makeDndPorts(w.u);
    // Use real registered store via startOrJoin pattern with memory?
    // Prefer live ports + a fresh memory store for isolation.
    const store = memoryEncounterStore();

    const sj = await startOrJoin({
      roomId: "room-smoke",
      store,
      ports,
      startedBy: pc.id,
      participant: {
        actorId: pc.id,
        name: "Hero",
        kind: "pc",
      },
      autoBegin: false,
    });
    assert(sj);
    await joinEncounter(sj.encounter.id, {
      actorId: npc.id,
      name: "Goblin",
      kind: "npc",
    }, { store, ports });

    let enc = (await beginEncounter(sj.encounter.id, {
      store,
      ports,
    }))!;
    assertEquals(enc.status, "active");

    // Force PC turn
    const pcIdx = enc.participants.findIndex(
      (p) => p.actorId === pc.id,
    );
    enc = { ...enc, turnIdx: pcIdx >= 0 ? pcIdx : 0 };
    await store.save(enc);

    // Attack until goblin down (bounded)
    for (let i = 0; i < 10; i++) {
      // deno-lint-ignore no-explicit-any
      const hp = (w.map.get("n1")!.state as any).dnd.hp.current;
      if (hp <= 0) break;
      const cur = currentActor(enc)!;
      if (cur.actorId !== pc.id) {
        // skip NPC via pass as staff force
        const r = await passTurn(enc.id, {
          actorId: cur.actorId,
          store,
          ports,
          force: true,
          walk: false,
        });
        enc = r.encounter ?? enc;
        continue;
      }
      await ports.executeAction(pc.id, {
        type: "attack",
        targetId: npc.id,
      }, {
        encounter: enc,
        actor: {
          id: pc.id,
          name: "Hero",
          kind: "pc",
          isOut: false,
          healthFrac: 1,
        },
        participant: cur,
      });
      const r = await passTurn(enc.id, {
        actorId: pc.id,
        store,
        ports,
        walk: true,
      });
      enc = r.encounter ?? enc;
    }

    // deno-lint-ignore no-explicit-any
    const gobHp = (w.map.get("n1")!.state as any).dnd.hp.current;
    assert(gobHp <= 0, `goblin should be down, hp=${gobHp}`);

    // End fight explicitly (D&D keeps active for +kill)
    const ended = await endFight(enc.id, { store, ports });
    assertEquals(ended?.status, "resolved");
    removeDndCombat();
  },
);
