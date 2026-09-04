/**
 * Sticky focus + resolveCombatTarget.
 */
import { assertEquals } from "@std/assert";
import {
  clearFocus,
  readFocus,
  resolveCombatTarget,
  setFocus,
} from "../src/combat/focus.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockU(objs: IDBObj[], me: IDBObj) {
  const dbCalls: unknown[][] = [];
  return {
    me,
    send: () => {},
    util: {
      stripSubs: (s: string) => s,
      displayName: (o: IDBObj) => o.name || "?",
      target: async (_me: IDBObj, q: string) => {
        const bare = q.replace(/^#/, "").toLowerCase();
        return objs.find((o) =>
          o.id === bare ||
          String(o.name || "").toLowerCase() === bare
        ) ?? null;
      },
    },
    db: {
      search: async (q: Record<string, unknown>) => {
        if (q.id) {
          return objs.filter((o) => o.id === String(q.id));
        }
        return objs.filter((o) =>
          o.location === String(q.location || "")
        );
      },
      modify: async (...a: unknown[]) => {
        dbCalls.push(a);
        const id = String(a[0]);
        const data = a[2] as Record<string, unknown>;
        if (id === me.id && data["data.dndCombat"]) {
          // deno-lint-ignore no-explicit-any
          (me.state as any).dndCombat = data["data.dndCombat"];
        }
      },
    },
    _dbCalls: dbCalls,
  } as unknown as IUrsamuSDK & { _dbCalls: unknown[][] };
}

Deno.test("setFocus / resolve without arg", OPTS, async () => {
  const skel = {
    id: "n1",
    name: "Skeleton",
    location: "r1",
    flags: new Set(["thing", "npc"]),
    state: {},
  } as unknown as IDBObj;
  const me = {
    id: "p1",
    name: "Hero",
    location: "r1",
    flags: new Set(["player"]),
    state: {},
  } as unknown as IDBObj;
  const u = mockU([skel, me], me);
  await setFocus(u, skel);
  assertEquals(readFocus(me).focusId, "n1");
  const r = await resolveCombatTarget(u, "r1", "");
  assertEquals(r.target?.id, "n1");
});

Deno.test("explicit arg sets focus", OPTS, async () => {
  const skel = {
    id: "n2",
    name: "Zombie",
    location: "r1",
    flags: new Set(["thing"]),
    state: {},
  } as unknown as IDBObj;
  const me = {
    id: "p1",
    name: "Hero",
    location: "r1",
    flags: new Set(["player"]),
    state: {},
  } as unknown as IDBObj;
  const u = mockU([skel, me], me);
  const r = await resolveCombatTarget(u, "r1", "Zombie");
  assertEquals(r.target?.id, "n2");
  assertEquals(readFocus(me).focusName, "Zombie");
});

Deno.test("clearFocus", OPTS, async () => {
  const me = {
    id: "p1",
    location: "r1",
    flags: new Set(["player"]),
    state: { dndCombat: { focusId: "x", focusName: "X" } },
  } as unknown as IDBObj;
  const u = mockU([me], me);
  await clearFocus(u);
  assertEquals(readFocus(me).focusId, undefined);
});
