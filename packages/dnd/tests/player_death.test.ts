/**
 * Player death → corpse + underworld; +res restores gear.
 */
import { assertEquals, assert } from "@std/assert";
import { defaultSheet } from "../src/stats/dnd_sheet.ts";
import { applyDamage, isDead } from "../src/stats/vitality.ts";
import {
  isPlayerCorpse,
  processPlayerDeath,
} from "../src/stats/player-death.ts";
import {
  cheapSelfRes,
  loseSomeCoins,
  loseSomeXp,
  resurrectPlayer,
} from "../src/stats/resurrect.ts";
import { totalCp } from "../src/stats/currency.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

type Obj = IDBObj & {
  location: string;
  state: Record<string, unknown>;
  name?: string;
};

function mockWorld() {
  const map = new Map<string, Obj>();
  let seq = 200;
  const put = (o: Obj) => {
    map.set(o.id, o);
    return o;
  };
  put({
    id: "uw",
    name: "The Grey Veil",
    flags: new Set(["room", "safe"]),
    location: "",
    contents: [],
    state: { name: "The Grey Veil", dndUnderworld: true },
  } as Obj);
  put({
    id: "room1",
    name: "Crypt",
    flags: new Set(["room"]),
    location: "",
    contents: [],
    state: { name: "Crypt" },
  } as Obj);

  const sheet = defaultSheet();
  sheet.hp = { max: 10, current: 10, temp: 0 };
  const hero = put({
    id: "p1",
    name: "Hero",
    flags: new Set(["player", "connected"]),
    location: "room1",
    contents: [],
    state: { name: "Hero", dnd: sheet },
  } as Obj);
  put({
    id: "sword1",
    name: "Longsword",
    flags: new Set(["thing"]),
    location: "p1",
    contents: [],
    state: {
      name: "Longsword",
      dnd: { type: "weapon", equipped: true },
    },
  } as Obj);

  const sent: string[] = [];
  const u = {
    me: hero,
    send: (m: string, _t?: string) => {
      sent.push(m);
    },
    broadcast: (m: string) => {
      sent.push(m);
    },
    teleport: (id: string, dest: string) => {
      const o = map.get(id);
      if (o) o.location = dest;
    },
    util: {
      displayName: (o: IDBObj) => o.name || "?",
    },
    db: {
      search: async (q: Record<string, unknown>) => {
        if (q.id) {
          const o = map.get(String(q.id));
          return o ? [o] : [];
        }
        if (q.location !== undefined) {
          return [...map.values()].filter(
            (o) => o.location === String(q.location),
          );
        }
        return [...map.values()];
      },
      create: async (tmpl: Partial<Obj>) => {
        const id = String(++seq);
        const o = {
          id,
          name: tmpl.name ?? id,
          flags: tmpl.flags ?? new Set(["thing"]),
          location: String(tmpl.location ?? ""),
          contents: [],
          state: (tmpl.state ?? {}) as Record<string, unknown>,
        } as Obj;
        map.set(id, o);
        return o;
      },
      modify: async (
        id: string,
        _op: string,
        data: Record<string, unknown>,
      ) => {
        const o = map.get(id);
        if (!o) return;
        for (const [k, v] of Object.entries(data)) {
          if (k === "location") o.location = String(v);
          else if (k === "data.dnd") {
            o.state = { ...o.state, dnd: v };
          } else if (k === "data.dnd.equipped") {
            const dnd = {
              ...((o.state.dnd as object) || {}),
              equipped: v,
            };
            o.state = { ...o.state, dnd };
          }
        }
      },
      destroy: async (id: string) => {
        map.delete(id);
      },
    },
  } as unknown as IUrsamuSDK;

  return { map, u, hero, sent };
}

Deno.test("applyDamage massive → dead flag", OPTS, () => {
  const s = defaultSheet();
  s.hp = { max: 10, current: 5, temp: 0 };
  const r = applyDamage(s, 100);
  assert(isDead(r.sheet));
  assert(r.instantDeath);
});

Deno.test("processPlayerDeath corpse + spirit", OPTS, async () => {
  const { map, u, hero } = mockWorld();
  let sheet = defaultSheet();
  sheet.hp = { max: 10, current: 0, temp: 0 };
  sheet.death = {
    successes: 0,
    failures: 3,
    stable: false,
    dead: true,
  };
  const r = await processPlayerDeath(u, hero, sheet, {
    underworldId: "uw",
  });
  assert(r.corpseId);
  assertEquals(hero.location, "uw");
  // deno-lint-ignore no-explicit-any
  const dnd = (hero.state as any).dnd;
  assertEquals(dnd.death.spirit, true);
  assertEquals(dnd.death.corpseId, r.corpseId);

  const corpse = map.get(r.corpseId)!;
  assert(isPlayerCorpse(corpse));
  assertEquals(corpse.location, "room1");

  const sword = map.get("sword1")!;
  assertEquals(sword.location, r.corpseId);
});

Deno.test("full resurrect restores body and gear", OPTS, async () => {
  const { map, u, hero } = mockWorld();
  let sheet = defaultSheet();
  sheet.hp = { max: 10, current: 0, temp: 0 };
  sheet.death = {
    successes: 0,
    failures: 3,
    stable: false,
    dead: true,
  };
  const died = await processPlayerDeath(u, hero, sheet, {
    underworldId: "uw",
  });
  const corpse = map.get(died.corpseId)!;
  const res = await resurrectPlayer(u, { corpse });
  assertEquals(res.ok, true);
  assertEquals(hero.location, "room1");
  // deno-lint-ignore no-explicit-any
  const dnd = (hero.state as any).dnd;
  assertEquals(dnd.death?.dead ?? false, false);
  assertEquals(dnd.hp.current, 1);
  assertEquals(map.get("sword1")!.location, "p1");
  assertEquals(map.has(died.corpseId), false);
});

Deno.test("loseSomeCoins takes a cut not all", OPTS, () => {
  const s = defaultSheet();
  s.money = { cp: 0, sp: 0, ep: 0, gp: 100, pp: 1 };
  s.gold = 110;
  const before = totalCp(s);
  const r = loseSomeCoins(s, 0.1);
  assert(r.lostCp > 0);
  assert(r.lostCp < before);
  assertEquals(totalCp(r.sheet), before - r.lostCp);
  assert(r.lostLabel.includes("gp") || r.lostLabel.includes("pp"));
});

Deno.test("loseSomeXp takes 10%", OPTS, () => {
  const s = defaultSheet();
  s.xp = 1000;
  const r = loseSomeXp(s, 0.1);
  assertEquals(r.lost, 100);
  assertEquals(r.sheet.xp, 900);
});

Deno.test("cheap self-res home, no gear, penalties", OPTS, async () => {
  const { map, u, hero } = mockWorld();
  // home = playerStart default "1" — put a home room
  map.set("1", {
    id: "1",
    name: "Home",
    flags: new Set(["room"]),
    location: "",
    contents: [],
    state: { name: "Home" },
  } as never);
  let sheet = defaultSheet();
  sheet.hp = { max: 10, current: 0, temp: 0 };
  sheet.xp = 500;
  sheet.money = { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 };
  sheet.gold = 50;
  sheet.death = {
    successes: 0,
    failures: 3,
    stable: false,
    dead: true,
  };
  const died = await processPlayerDeath(u, hero, sheet, {
    underworldId: "uw",
  });
  const r = await cheapSelfRes(u, hero);
  assertEquals(r.ok, true);
  assertEquals(hero.location, "1"); // home
  // deno-lint-ignore no-explicit-any
  const dnd = (hero.state as any).dnd;
  assertEquals(dnd.hp.current, 1);
  assertEquals(dnd.death?.dead ?? false, false);
  assertEquals(dnd.xp, 450); // -10%
  assert(totalCp(dnd) < 5000); // lost some of 50gp
  // gear still on corpse
  assertEquals(map.get("sword1")!.location, died.corpseId);
  assert(map.has(died.corpseId));
});
