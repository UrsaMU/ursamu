/**
 * Combat target: partial names + ordinals + ambiguous list.
 */
import { assertEquals, assert } from "@std/assert";
import {
  formatAmbiguous,
  matchRoomTargets,
  resolveCombatTarget,
} from "../src/combat/focus.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockU(objs: IDBObj[], me: IDBObj) {
  return {
    me,
    send: () => {},
    util: {
      stripSubs: (s: string) => s,
      displayName: (o: IDBObj) =>
        String(o.name || o.state?.name || "?"),
      target: async (_m: IDBObj, q: string) => {
        const bare = q.replace(/^#/, "");
        return objs.find((o) => o.id === bare) ?? null;
      },
    },
    db: {
      search: async (q: Record<string, unknown>) => {
        if (q.id) {
          return objs.filter((o) => o.id === String(q.id));
        }
        if (q.location) {
          return objs.filter(
            (o) => o.location === String(q.location),
          );
        }
        return objs;
      },
      modify: async (
        id: string,
        _op: string,
        data: Record<string, unknown>,
      ) => {
        if (id === me.id && data["data.dndCombat"]) {
          // deno-lint-ignore no-explicit-any
          (me.state as any).dndCombat = data["data.dndCombat"];
        }
      },
    },
  } as unknown as IUrsamuSDK;
}

function gob(id: string, loc = "r1"): IDBObj {
  return {
    id,
    name: "Goblin Sneak",
    location: loc,
    flags: new Set(["thing", "npc"]),
    state: {
      name: "Goblin Sneak",
      dnd: { hp: { current: 7, max: 7 }, class: "Monster" },
    },
  } as unknown as IDBObj;
}

Deno.test("partial name unique hit", OPTS, async () => {
  const me = {
    id: "p1",
    location: "r1",
    flags: new Set(["player"]),
    state: {},
  } as unknown as IDBObj;
  const u = mockU([gob("10"), me], me);
  const r = await matchRoomTargets(u, "r1", "sneak");
  assertEquals(r.target?.id, "10");
});

Deno.test("two goblins need ordinal", OPTS, async () => {
  const me = {
    id: "p1",
    location: "r1",
    flags: new Set(["player"]),
    state: {},
  } as unknown as IDBObj;
  const u = mockU([gob("10"), gob("11"), me], me);
  const amb = await matchRoomTargets(u, "r1", "goblin");
  assertEquals(amb.target, null);
  assert(amb.error?.includes("Which"));
  assert(amb.error?.includes("#10"));
  assert(amb.error?.includes("#11"));

  const second = await matchRoomTargets(u, "r1", "2.goblin");
  assertEquals(second.target?.id, "11");

  const byId = await matchRoomTargets(u, "r1", "#10");
  assertEquals(byId.target?.id, "10");
});

Deno.test("resolveCombatTarget sets focus on ordinal", OPTS, async () => {
  const me = {
    id: "p1",
    location: "r1",
    flags: new Set(["player"]),
    state: {},
  } as unknown as IDBObj;
  const u = mockU([gob("10"), gob("11"), me], me);
  const r = await resolveCombatTarget(u, "r1", "2.gob");
  assertEquals(r.target?.id, "11");
  // bare +attack uses focus
  const again = await resolveCombatTarget(u, "r1", "");
  assertEquals(again.target?.id, "11");
});

Deno.test("formatAmbiguous lists ordinals", OPTS, () => {
  const me = {
    id: "p1",
    flags: new Set(["player"]),
    state: {},
  } as unknown as IDBObj;
  const u = mockU([gob("10"), gob("11")], me);
  const msg = formatAmbiguous(u, [gob("10"), gob("11")], "gob");
  assert(msg.includes("1. #10"));
  assert(msg.includes("2. #11"));
  assert(msg.includes("2.gob"));
});
