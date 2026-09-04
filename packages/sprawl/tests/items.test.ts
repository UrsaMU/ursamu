import { assertEquals, assert } from "@std/assert";
import {
  attackModeTags,
  buildItemData,
  combatGearBonusFromItems,
  consumeUse,
  createItem,
  formatModInstall,
  inferConsumable,
  isUsable,
  itemData,
  itemDisplayLines,
  itemLabel,
  itemModLines,
  loadFromItems,
  rollUsesDice,
} from "../engine/items.ts";
import { overloadFrom } from "../db/schemas.ts";
import type { IDBObj } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("inferConsumable repairs market lazarus", OPTS, () => {
  const raw = buildItemData({
    slug: "lazarus-patches-blister-pack-of-6-patches",
    kind: "gear",
    load: 1,
  });
  assertEquals(raw.useEffect, undefined);
  // isUsable infers from slug even before persist
  assert(isUsable(raw));
  const { data, changed } = inferConsumable(
    raw,
    "Lazarus Patches (blister pack of 6 patches)",
  );
  assert(changed);
  assertEquals(data.useEffect, "lazarus");
  assertEquals(data.uses, 6);
  assert(isUsable(data));
});

Deno.test("rollUsesDice ranges", OPTS, () => {
  let i = 0;
  const seq = [6, 6, 6];
  assertEquals(rollUsesDice("3d6", () => seq[i++]), 18);
  i = 0;
  assertEquals(rollUsesDice("1d6", () => seq[i++]), 6);
  i = 0;
  assertEquals(rollUsesDice("d6", () => seq[i++]), 6);
});

Deno.test("buildItemData rolls usesDice once", OPTS, () => {
  let i = 0;
  const seq = [2, 3];
  const d = buildItemData({
    slug: "yeheyuan",
    name: "Yeheyuan cigarettes",
    kind: "consumable",
    load: 1,
    usesDice: "2d6",
    unit: "cigarette",
    useEffect: "narrative",
  }, () => seq[i++]);
  assertEquals(d.uses, 5);
  assertEquals(d.usesMax, 5);
  assertEquals(d.unit, "cigarette");
  assert(isUsable(d));
});

Deno.test("buildItemData fixed uses", OPTS, () => {
  const d = buildItemData({
    slug: "ramen",
    uses: 3,
    unit: "sachet",
    useEffect: "narrative",
  });
  assertEquals(d.uses, 3);
  assertEquals(d.usesMax, 3);
});

Deno.test("load and combat bonus from item data", OPTS, () => {
  const items = [
    { slug: "a", kind: "firearm", load: 2, bonus: 1 },
    { slug: "b", kind: "gear", load: 1, bonus: 0 },
    // armor only counts while worn
    { slug: "c", kind: "armor", load: 1, bonus: 1 },
    {
      slug: "d",
      kind: "armor",
      load: 1,
      bonus: 1,
      slot: "worn",
    },
  ];
  assertEquals(loadFromItems(items), 5);
  assertEquals(overloadFrom(4, 10), 0);
  assertEquals(overloadFrom(12, 10), 2);
  const g = combatGearBonusFromItems(items);
  assertEquals(g.total, 2); // gun + worn armor
  assertEquals(g.upgrade, 0);
});

Deno.test("attackModeTags map modes", OPTS, () => {
  assertEquals(attackModeTags(""), ["shot"]);
  assertEquals(attackModeTags("aim2"), ["aim"]);
  assertEquals(attackModeTags("burst"), ["burst"]);
  assertEquals(attackModeTags("melee"), ["melee", "shot"]);
  assertEquals(attackModeTags("pb"), ["shot", "pb"]);
});

Deno.test("attached mods count by action tag", OPTS, () => {
  const gun = {
    slug: "pkd-45",
    kind: "firearm",
    load: 1,
    bonus: 1,
    mods: [
      {
        slug: "targeting-scope",
        name: "Targeting scope",
        bonus: 1,
        tags: ["aim"],
      },
      {
        slug: "custom-grips",
        name: "Custom grips",
        bonus: 1,
        tags: ["shot"],
      },
      {
        slug: "gyro-stabilisation",
        name: "Gyro",
        bonus: 1,
        tags: ["burst"],
      },
      {
        slug: "smart-targeting",
        name: "Smart targeting",
        bonus: 0,
        tags: ["upgrade-shot"],
      },
      {
        slug: "silencer",
        name: "Silencer",
        bonus: 0,
        tags: ["suppressor"],
      },
    ],
  };

  const shot = combatGearBonusFromItems([gun], {
    actionTags: attackModeTags(""),
  });
  assertEquals(shot.total, 2); // gun + grips
  assertEquals(shot.upgrade, 1);
  assert(shot.parts.some((p) => p.includes("grips")));
  assert(!shot.parts.some((p) => p.includes("scope")));

  const aim = combatGearBonusFromItems([gun], {
    actionTags: attackModeTags("aim"),
  });
  assertEquals(aim.total, 2); // gun + scope
  assert(aim.parts.some((p) => p.includes("scope")));
  assert(!aim.parts.some((p) => p.includes("grips")));

  const burst = combatGearBonusFromItems([gun], {
    actionTags: attackModeTags("burst"),
  });
  assertEquals(burst.total, 2); // gun + gyro
  assert(burst.parts.some((p) => /gyro/i.test(p)));

  const melee = combatGearBonusFromItems([gun], {
    actionTags: attackModeTags("melee"),
  });
  // Firearm host + mods skipped on melee attacks.
  assertEquals(melee.total, 0);
  assertEquals(melee.upgrade, 0);
});

Deno.test("melee host mods apply on melee", OPTS, () => {
  const blade = {
    slug: "mono-blade",
    kind: "melee",
    load: 1,
    bonus: 1,
    mods: [
      {
        slug: "custom-grips",
        name: "Custom grips",
        bonus: 1,
        tags: ["shot"],
      },
    ],
  };
  const m = combatGearBonusFromItems([blade], {
    actionTags: attackModeTags("melee"),
  });
  assertEquals(m.total, 2);
  const s = combatGearBonusFromItems([blade], {
    actionTags: attackModeTags(""),
  });
  // melee host skipped on ranged
  assertEquals(s.total, 0);
});

Deno.test("loose mod Things do not count", OPTS, () => {
  const loose = {
    slug: "targeting-scope",
    kind: "mod",
    load: 0,
    bonus: 1,
    tags: ["aim"],
  };
  const g = combatGearBonusFromItems([loose], {
    actionTags: ["aim"],
  });
  assertEquals(g.total, 0);
});

Deno.test("gun without useEffect is not usable", OPTS, () => {
  const d = buildItemData({
    slug: "pkd-45",
    kind: "firearm",
    bonus: 1,
  });
  assertEquals(isUsable(d), false);
});

function mockUWithStore() {
  const objs: IDBObj[] = [];
  const u = {
    me: {
      id: "p1",
      name: "Neon",
      flags: new Set(["player", "connected"]),
      state: {
        name: "Neon",
        sprawl: {
          version: 1,
          chargenStatus: "approved",
          chargenComplete: true,
          name: "Neon",
          stats: {
            morphology: 1,
            equilibrium: 0,
            reaction: 2,
            cognition: 1,
            affinity: 0,
          },
          resilience: 10,
          resilienceMax: 12,
          loadoutMax: 10,
          bityuan: 100,
          affectations: [],
          quirks: [],
          loadout: [],
          augs: [],
          shards: [],
          software: [],
          ap: 0,
          level: 0,
          notes: "",
        },
      },
      location: "r1",
      contents: [],
    } as unknown as IDBObj,
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
          if (path === "data.sprawl_item" || path === "state.sprawl_item") {
            o.state = { ...o.state, sprawl_item: val };
          }
          if (path === "state.sprawl") {
            o.state = { ...o.state, sprawl: val };
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
  return { u: u as unknown as import("@ursamu/mush").IUrsamuSDK, objs };
}

Deno.test("createItem + consumeUse depletes and destroys", OPTS, async () => {
  const { u, objs } = mockUWithStore();
  const item = await createItem(u, "p1", {
    slug: "yeheyuan",
    name: "Yeheyuan cigarettes",
    kind: "consumable",
    load: 1,
    uses: 2,
    unit: "cigarette",
    useEffect: "narrative",
  });
  assert(item);
  assertEquals(objs.length, 1);
  assertEquals(itemData(item)?.uses, 2);
  const r1 = await consumeUse(u, item);
  assertEquals(r1.left, 1);
  assertEquals(r1.destroyed, false);
  assertEquals(itemData(objs[0])?.uses, 1);
  const r2 = await consumeUse(u, objs[0]);
  assertEquals(r2.destroyed, true);
  assertEquals(objs.length, 0);
});

Deno.test("itemLabel shows uses", OPTS, () => {
  const o = {
    id: "1",
    name: "Yeheyuan cigarettes",
    flags: new Set(["thing"]),
    state: {
      sprawl_item: {
        slug: "yeheyuan",
        kind: "consumable",
        load: 1,
        uses: 7,
        usesMax: 11,
        unit: "cigarette",
      },
    },
    contents: [],
  } as unknown as IDBObj;
  const label = itemLabel(o);
  assert(label.includes("7/11"));
  assert(label.includes("cigarette"));
});

Deno.test("formatModInstall tags and bonus", OPTS, () => {
  assertEquals(
    formatModInstall({
      slug: "targeting-scope",
      name: "Targeting scope",
      bonus: 1,
      tags: ["aim"],
    }),
    "Targeting scope (+1 · aim)",
  );
  assertEquals(
    formatModInstall({
      slug: "silencer",
      name: "Silencer",
      tags: ["suppressor"],
    }),
    "Silencer (suppressor)",
  );
  assertEquals(
    formatModInstall({ slug: "bio-lock", name: "Bio-lock" }),
    "Bio-lock",
  );
});

Deno.test("buildItemData keeps mod load 0 and tags", OPTS, () => {
  const d = buildItemData({
    slug: "targeting-scope",
    kind: "mod",
    load: 0,
    bonus: 1,
    tags: ["aim"],
    hostKinds: ["firearm", "heavy"],
    notes: "+1 bonus to aiming",
  });
  assertEquals(d.load, 0);
  assertEquals(d.tags, ["aim"]);
  assertEquals(d.hostKinds, ["firearm", "heavy"]);
});

Deno.test("itemModLines nested under host", OPTS, () => {
  const o = {
    id: "w1",
    name: "PKD-45",
    flags: new Set(["thing"]),
    state: {
      sprawl_item: {
        slug: "pkd-45",
        kind: "firearm",
        load: 1,
        bonus: 1,
        slot: "wielded",
        mods: [
          {
            slug: "targeting-scope",
            name: "Targeting scope",
            bonus: 1,
            tags: ["aim"],
          },
          {
            slug: "silencer",
            name: "Silencer",
            tags: ["suppressor"],
          },
        ],
      },
    },
    contents: [],
  } as unknown as IDBObj;

  const label = itemLabel(o);
  assert(label.includes("wielded"));
  assert(label.includes("2 mods"));
  assert(label.includes("+1"));

  const nested = itemModLines(o);
  assertEquals(nested.length, 2);
  assert(nested[0].startsWith("       └ "));
  assert(nested[0].includes("Targeting scope"));
  assert(nested[0].includes("aim"));
  assert(nested[1].includes("Silencer"));

  const rows = itemDisplayLines(o, { index: 1 });
  assertEquals(rows[0], `#1 ${label}`);
  assertEquals(rows.length, 3);
  assertEquals(itemModLines({
    id: "x",
    name: "Bare",
    flags: new Set(["thing"]),
    state: {
      sprawl_item: { slug: "bare", kind: "melee", load: 1 },
    },
    contents: [],
  } as unknown as IDBObj), []);
});
