/**
 * Solo PC at 0 HP → death saves until dead or stable.
 */
import { assertEquals, assert } from "@std/assert";
import { defaultSheet } from "../src/stats/dnd_sheet.ts";
import {
  applyDamage,
  isDead,
  isDying,
} from "../src/stats/vitality.ts";
import { resolveDyingPc } from "../src/stats/downed-resolve.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockDyingHero() {
  const map = new Map<string, IDBObj>();
  let sheet = defaultSheet();
  sheet.hp = { max: 10, current: 0, temp: 0 };
  sheet.death = {
    successes: 0,
    failures: 0,
    stable: false,
    dead: false,
  };
  assert(isDying(sheet));

  const hero = {
    id: "p1",
    name: "Hero",
    flags: new Set(["player"]),
    location: "room1",
    contents: [],
    state: { name: "Hero", dnd: sheet },
  } as unknown as IDBObj;
  map.set("p1", hero);
  map.set("uw", {
    id: "uw",
    flags: new Set(["room"]),
    location: "",
    contents: [],
    state: { dndUnderworld: true },
  } as unknown as IDBObj);
  map.set("room1", {
    id: "room1",
    flags: new Set(["room"]),
    location: "",
    contents: [],
    state: {},
  } as unknown as IDBObj);

  let seq = 400;
  const u = {
    me: hero,
    send: () => {},
    broadcast: () => {},
    teleport: (id: string, dest: string) => {
      const o = map.get(id) as { location?: string };
      if (o) o.location = dest;
    },
    util: { displayName: (o: IDBObj) => o.name || "?" },
    db: {
      search: async (q: Record<string, unknown>) => {
        if (q.id) {
          const o = map.get(String(q.id));
          return o ? [o] : [];
        }
        if (q.location !== undefined) {
          return [...map.values()].filter(
            (o) =>
              (o as { location?: string }).location ===
                String(q.location),
          );
        }
        return [...map.values()];
      },
      create: async (tmpl: Record<string, unknown>) => {
        const id = String(++seq);
        const o = {
          id,
          name: tmpl.name,
          flags: tmpl.flags ?? new Set(["thing"]),
          location: tmpl.location,
          contents: [],
          state: tmpl.state ?? {},
        } as unknown as IDBObj;
        map.set(id, o);
        return o;
      },
      modify: async (
        id: string,
        _op: string,
        data: Record<string, unknown>,
      ) => {
        const o = map.get(id) as {
          location?: string;
          state?: Record<string, unknown>;
        };
        if (!o) return;
        if (data.location) o.location = String(data.location);
        if (data["data.dnd"]) {
          o.state = { ...o.state, dnd: data["data.dnd"] };
        }
      },
      destroy: async () => {},
    },
  } as unknown as IUrsamuSDK;

  return { u, hero, map };
}

Deno.test("applyDamage to 0 is dying not dead", OPTS, () => {
  const s = defaultSheet();
  s.hp = { max: 9, current: 3, temp: 0 };
  const r = applyDamage(s, 5);
  assertEquals(r.sheet.hp.current, 0);
  assertEquals(isDead(r.sheet), false);
  assert(isDying(r.sheet));
});

Deno.test(
  "three failed death saves → dead + underworld",
  OPTS,
  async () => {
    const { u, hero, map } = mockDyingHero();
    const orig = Math.random;
    Math.random = () => 0.05; // d20 = 2 → fail
    try {
      const r = await resolveDyingPc(u, hero, {
        quiet: true,
        underworldId: "uw",
      });
      assertEquals(r.died, true);
      assert(isDead(
        // deno-lint-ignore no-explicit-any
        (hero.state as any).dnd,
      ));
      assertEquals(
        (hero as { location?: string }).location,
        "uw",
      );
      // corpse exists
      const corpses = [...map.values()].filter((o) => {
        // deno-lint-ignore no-explicit-any
        const d = (o.state as any)?.dnd;
        return d?.type === "player_corpse";
      });
      assertEquals(corpses.length >= 1, true);
    } finally {
      Math.random = orig;
    }
  },
);

Deno.test(
  "three successes → stable, still in room",
  OPTS,
  async () => {
    const { u, hero } = mockDyingHero();
    const orig = Math.random;
    Math.random = () => 0.9; // d20 = 19 → success
    try {
      const r = await resolveDyingPc(u, hero, {
        quiet: true,
        underworldId: "uw",
      });
      assertEquals(r.died, false);
      assertEquals(r.stable, true);
      assertEquals(
        (hero as { location?: string }).location,
        "room1",
      );
    } finally {
      Math.random = orig;
    }
  },
);
