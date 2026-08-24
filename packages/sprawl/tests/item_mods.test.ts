import { assertEquals, assert } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  attachMod,
  detachMod,
  parseHostModArg,
  toModInstall,
} from "../engine/item-mods.ts";
import {
  createItem,
  itemData,
  itemModLines,
} from "../engine/items.ts";
import type { SprawlItemData } from "../db/schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockUWithStore() {
  const objs: IDBObj[] = [];
  const u = {
    me: { id: "p1" } as IDBObj,
    db: {
      create: async (t: Partial<IDBObj>) => {
        const o = {
          id: `t${objs.length + 1}`,
          name: t.name ?? "x",
          flags: t.flags ?? new Set(["thing"]),
          location: t.location ?? "p1",
          state: t.state ?? {},
          contents: [],
        } as IDBObj;
        objs.push(o);
        return o;
      },
      search: async (q: Record<string, unknown>) => {
        if (q.location) {
          return objs.filter((o) => o.location === q.location);
        }
        return objs;
      },
      modify: async (
        id: string,
        _op: string,
        fields: Record<string, unknown>,
      ) => {
        const o = objs.find((x) => x.id === id);
        if (!o) return;
        for (const [path, val] of Object.entries(fields)) {
          if (
            path === "data.sprawl_item" ||
            path === "state.sprawl_item"
          ) {
            o.state = { ...o.state, sprawl_item: val };
          }
        }
      },
      destroy: async (id: string) => {
        const i = objs.findIndex((o) => o.id === id);
        if (i >= 0) objs.splice(i, 1);
      },
    },
    send: () => {},
  };
  return {
    u: u as unknown as IUrsamuSDK,
    objs,
  };
}

Deno.test("parseHostModArg", OPTS, () => {
  assertEquals(parseHostModArg(""), null);
  assertEquals(parseHostModArg("pkd-45"), { host: "pkd-45" });
  assertEquals(parseHostModArg("pkd-45=targeting-scope"), {
    host: "pkd-45",
    mod: "targeting-scope",
  });
  assertEquals(parseHostModArg("  #1 = scope "), {
    host: "#1",
    mod: "scope",
  });
});

Deno.test("toModInstall from data + catalog tags", OPTS, () => {
  const d: SprawlItemData = {
    slug: "targeting-scope",
    kind: "mod",
    load: 0,
    bonus: 1,
    tags: ["aim"],
  };
  const m = toModInstall(d, "Targeting scope");
  assertEquals(m.slug, "targeting-scope");
  assertEquals(m.bonus, 1);
  assertEquals(m.tags, ["aim"]);
});

Deno.test("attachMod nests on host and destroys loose", OPTS, async () => {
  const { u, objs } = mockUWithStore();
  const gun = await createItem(u, "p1", {
    slug: "pkd-45",
    name: "PKD-45",
    kind: "firearm",
    load: 1,
    bonus: 1,
  });
  const scope = await createItem(u, "p1", {
    slug: "targeting-scope",
    name: "Targeting scope",
    kind: "mod",
    load: 0,
    bonus: 1,
    tags: ["aim"],
    hostKinds: ["firearm", "heavy"],
    notes: "+1 bonus to aiming",
  });
  assert(gun && scope);
  assertEquals(objs.length, 2);

  const r = await attachMod(u, "p1", "pkd-45", "targeting-scope");
  assert(r.ok);
  assertEquals(objs.length, 1);
  const hd = itemData(objs[0])!;
  assertEquals(hd.mods?.length, 1);
  assertEquals(hd.mods![0].slug, "targeting-scope");
  assertEquals(hd.mods![0].tags, ["aim"]);
  assertEquals(itemModLines(objs[0]).length, 1);
});

Deno.test("attachMod rejects wrong host kind", OPTS, async () => {
  const { u } = mockUWithStore();
  await createItem(u, "p1", {
    slug: "leathers",
    name: "Leathers",
    kind: "armor",
    load: 1,
  });
  await createItem(u, "p1", {
    slug: "targeting-scope",
    name: "Targeting scope",
    kind: "mod",
    load: 0,
    tags: ["aim"],
    hostKinds: ["firearm", "heavy"],
  });
  const r = await attachMod(u, "p1", "leathers", "targeting-scope");
  assertEquals(r.ok, false);
  if (!r.ok) assert(r.error.includes("firearm") || r.error.includes("Host"));
});

Deno.test("attachMod rejects non-mod item", OPTS, async () => {
  const { u } = mockUWithStore();
  await createItem(u, "p1", {
    slug: "pkd-45",
    name: "PKD-45",
    kind: "firearm",
    load: 1,
  });
  await createItem(u, "p1", {
    slug: "ammo-box",
    name: "Ammo",
    kind: "ammo",
    load: 1,
  });
  const r = await attachMod(u, "p1", "pkd-45", "ammo");
  assertEquals(r.ok, false);
});

Deno.test("detachMod restores loose Thing", OPTS, async () => {
  const { u, objs } = mockUWithStore();
  await createItem(u, "p1", {
    slug: "pkd-45",
    name: "PKD-45",
    kind: "firearm",
    load: 1,
    bonus: 1,
  });
  await createItem(u, "p1", {
    slug: "silencer",
    name: "Silencer",
    kind: "mod",
    load: 0,
    tags: ["suppressor"],
    hostKinds: ["firearm"],
  });
  const a = await attachMod(u, "p1", "pkd-45", "silencer");
  assert(a.ok);
  assertEquals(objs.length, 1);

  const d = await detachMod(u, "p1", "pkd-45", "silencer");
  assert(d.ok);
  assertEquals(objs.length, 2);
  const gun = objs.find((o) => itemData(o)?.slug === "pkd-45")!;
  const loose = objs.find((o) => itemData(o)?.slug === "silencer")!;
  assertEquals(itemData(gun)?.mods, undefined);
  assertEquals(itemData(loose)?.kind, "mod");
  assertEquals(itemData(loose)?.tags, ["suppressor"]);
});

Deno.test("attachMod blocks duplicate slug", OPTS, async () => {
  const { u } = mockUWithStore();
  await createItem(u, "p1", {
    slug: "pkd-45",
    name: "PKD-45",
    kind: "firearm",
    load: 1,
  });
  await createItem(u, "p1", {
    slug: "silencer",
    name: "Silencer",
    kind: "mod",
    load: 0,
    hostKinds: ["firearm"],
  });
  await createItem(u, "p1", {
    slug: "silencer",
    name: "Silencer 2",
    kind: "mod",
    load: 0,
    hostKinds: ["firearm"],
  });
  const a1 = await attachMod(u, "p1", "pkd-45", "silencer");
  assert(a1.ok);
  // Second silencer still loose — same slug blocked
  const a2 = await attachMod(u, "p1", "#1", "silencer");
  assertEquals(a2.ok, false);
});
