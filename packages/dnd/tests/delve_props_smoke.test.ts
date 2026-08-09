/**
 * Live-style smoke: open chest, use altar/campfire, no TAG>>.
 */
import { assertEquals, assert } from "@std/assert";
import { defaultSheet, migrateSheet } from
  "../src/stats/dnd_sheet.ts";
import { openDndChest } from "../src/commands/chest-open.ts";
import { useDndProp } from "../src/commands/prop-use.ts";
import {
  descCue,
  useAction,
} from "../src/world/interact.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

type Obj = IDBObj & {
  location: string;
  state: Record<string, unknown>;
  name?: string;
};

function mockWorld() {
  const map = new Map<string, Obj>();
  let seq = 500;
  const put = (o: Obj) => {
    map.set(o.id, o);
    return o;
  };

  put({
    id: "room1",
    name: "Boss Crypt",
    flags: new Set(["room"]),
    location: "",
    contents: [],
    state: { name: "Boss Crypt" },
  } as Obj);

  const sheet = defaultSheet();
  sheet.hp = { max: 20, current: 8, temp: 0 };
  sheet.gold = 0;
  sheet.money = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const hero = put({
    id: "p1",
    name: "Delver",
    flags: new Set(["player", "connected"]),
    location: "room1",
    contents: [],
    state: { name: "Delver", dnd: sheet },
  } as Obj);

  const chest = put({
    id: "chest1",
    name: "Stolen Chest;chest",
    flags: new Set(["thing"]),
    location: "room1",
    contents: [],
    state: {
      name: "Stolen Chest",
      dnd: { type: "chest", table: "scrap", opened: false },
    },
  } as Obj);

  const altar = put({
    id: "altar1",
    name: "Dusty Altar;altar",
    flags: new Set(["thing"]),
    location: "room1",
    contents: [],
    state: {
      name: "Dusty Altar",
      dnd: { type: "altar", used: false },
    },
  } as Obj);

  const fire = put({
    id: "fire1",
    name: "Cookfire;campfire",
    flags: new Set(["thing"]),
    location: "room1",
    contents: [],
    state: {
      name: "Cookfire",
      dnd: { type: "campfire", used: false },
    },
  } as Obj);

  const sent: string[] = [];
  const created: Obj[] = [];
  const u = {
    me: hero,
    send: (m: string) => {
      sent.push(m);
    },
    broadcast: (m: string) => {
      sent.push(m);
    },
    util: {
      displayName: (o: IDBObj) =>
        (o.name || "?").split(";")[0],
      stripSubs: (s: string) => s,
      target: async (_me: IDBObj, q: string) => {
        const low = q.toLowerCase().replace(/^#/, "");
        for (const o of map.values()) {
          if (o.id === low) return o;
          if ((o.name || "").toLowerCase().includes(low)) {
            return o;
          }
        }
        return null;
      },
    },
    db: {
      modify: async (
        id: string,
        _op: string,
        patch: Record<string, unknown>,
      ) => {
        const o = map.get(id);
        if (!o) return;
        if (patch["data.dnd"] !== undefined) {
          // deno-lint-ignore no-explicit-any
          (o.state as any).dnd = patch["data.dnd"];
          if (id === hero.id) {
            // deno-lint-ignore no-explicit-any
            (hero.state as any).dnd = patch["data.dnd"];
          }
        }
        if (patch.location !== undefined) {
          o.location = String(patch.location);
        }
      },
      create: async (d: Record<string, unknown>) => {
        const id = String(++seq);
        const o = {
          id,
          name: String(d.name || "thing"),
          flags: d.flags instanceof Set
            ? d.flags
            : new Set(["thing"]),
          location: String(d.location || ""),
          contents: [],
          state: (d.state as Record<string, unknown>) || {},
        } as Obj;
        map.set(id, o);
        created.push(o);
        return o;
      },
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
        return [];
      },
      destroy: async (id: string) => {
        map.delete(id);
      },
    },
  } as unknown as IUrsamuSDK & { _sent: string[] };

  return {
    u,
    hero,
    chest,
    altar,
    fire,
    sent,
    created,
    map,
  };
}

Deno.test("delve smoke: open chest soft messages", OPTS, async () => {
  const { u, chest, sent, created, hero } = mockWorld();
  assertEquals(useAction(chest)?.cmd, "open #chest1");
  assert(descCue(chest).includes("%chopen%cn"));

  const r = await openDndChest(u, chest);
  assertEquals(r.ok, true);
  // deno-lint-ignore no-explicit-any
  assertEquals((chest.state as any).dnd.opened, true);

  const out = sent.join("\n");
  assert(!out.includes(">>"), `no banners: ${out}`);
  assert(
    out.toLowerCase().includes("open") ||
      out.toLowerCase().includes("empty") ||
      out.toLowerCase().includes("pocket") ||
      out.toLowerCase().includes("inventory"),
  );

  // Second open fails cleanly
  const r2 = await openDndChest(u, chest);
  assertEquals(r2.ok, false);

  // Hero may have gained gp from scrap table
  const sheet = migrateSheet(
    // deno-lint-ignore no-explicit-any
    (hero.state as any).dnd,
  );
  assert(typeof sheet.money.gp === "number");
  // Items land via create when rolled
  void created;
});

Deno.test("delve smoke: use altar then spent", OPTS, async () => {
  const { u, altar, sent, hero } = mockWorld();
  assertEquals(useAction(altar)?.cmd, "use #altar1");

  const before = migrateSheet(
    // deno-lint-ignore no-explicit-any
    (hero.state as any).dnd,
  ).hp.current;
  const r = await useDndProp(u, altar);
  assertEquals(r.ok, true);
  const after = migrateSheet(
    // deno-lint-ignore no-explicit-any
    (hero.state as any).dnd,
  ).hp.current;
  assert(after > before, "altar heals");

  const out = sent.join("\n");
  assert(!out.includes(">>"));
  assert(out.toLowerCase().includes("heal") ||
    out.toLowerCase().includes("warmth"));

  const r2 = await useDndProp(u, altar);
  assertEquals(r2.ok, false);
  assertEquals(r2.message, "Its power is spent.");
});

Deno.test("delve smoke: campfire heals 5 once", OPTS, async () => {
  const { u, fire, hero } = mockWorld();
  const before = migrateSheet(
    // deno-lint-ignore no-explicit-any
    (hero.state as any).dnd,
  ).hp.current;
  const r = await useDndProp(u, fire);
  assertEquals(r.ok, true);
  const after = migrateSheet(
    // deno-lint-ignore no-explicit-any
    (hero.state as any).dnd,
  ).hp.current;
  assertEquals(after, Math.min(20, before + 5));
  const r2 = await useDndProp(u, fire);
  assertEquals(r2.ok, false);
});
