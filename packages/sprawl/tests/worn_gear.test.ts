import { assertEquals, assert } from "@std/assert";
import {
  buildItemData,
  combatGearBonusFromItems,
  itemLabel,
} from "../engine/items.ts";
import {
  combatBonusActive,
  effectiveLoadoutMax,
  wornStatBonuses,
} from "../engine/worn-gear.ts";
import { gatherBonuses } from "../engine/action.ts";
import { defaultChar } from "../db/schemas.ts";
import type { IDBObj } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function thing(
  data: ReturnType<typeof buildItemData>,
  name: string,
): IDBObj {
  return {
    id: "t-" + data.slug,
    name,
    flags: new Set(["thing"]),
    state: { sprawl_item: data },
    contents: [],
  } as unknown as IDBObj;
}

Deno.test("buildItemData armor worn fields", OPTS, () => {
  const d = buildItemData({
    slug: "exo-frame",
    kind: "armor",
    load: 1,
    bonus: 1,
    statMods: [{ stat: "morphology", mod: 1 }],
    loadoutMult: 2,
    bonusWhen: "worn",
  });
  assertEquals(d.bonusWhen, "worn");
  assertEquals(d.loadoutMult, 2);
  assertEquals(d.statMods?.[0].stat, "morphology");
  assertEquals(d.statMods?.[0].mod, 1);
  assert(itemLabel(thing(d, "Exo-frame")).includes("Mor+1"));
  assert(itemLabel(thing(d, "Exo-frame")).includes("loadout×2"));
});

Deno.test("armor combat bonus only when worn", OPTS, () => {
  const carried = buildItemData({
    slug: "heavy-kevlar",
    kind: "armor",
    bonus: 1,
    load: 1,
  });
  assertEquals(combatBonusActive(carried), false);
  const worn = { ...carried, slot: "worn" as const };
  assertEquals(combatBonusActive(worn), true);

  const gun = buildItemData({
    slug: "pkd-45",
    kind: "firearm",
    bonus: 1,
    load: 1,
  });
  assertEquals(combatBonusActive(gun), true);

  const bag = combatGearBonusFromItems([
    thing(carried, "Kevlar"),
    thing(gun, "PKD"),
  ]);
  assertEquals(bag.total, 1); // gun only

  const wornBag = combatGearBonusFromItems([
    thing(worn, "Kevlar"),
    thing(gun, "PKD"),
  ]);
  assertEquals(wornBag.total, 2);
});

Deno.test("exo-frame doubles loadout while worn", OPTS, () => {
  const exo = buildItemData({
    slug: "exo-frame",
    kind: "armor",
    bonus: 1,
    load: 1,
    loadoutMult: 2,
    statMods: [{ stat: "morphology", mod: 1 }],
  });
  const loose = thing(exo, "Exo-frame");
  assertEquals(effectiveLoadoutMax(10, [loose]), 10);
  const worn = thing({ ...exo, slot: "worn" }, "Exo-frame");
  assertEquals(effectiveLoadoutMax(10, [worn]), 20);
});

Deno.test("coil suit + wornStatBonuses reaction", OPTS, () => {
  const coil = buildItemData({
    slug: "coil-suit",
    kind: "armor",
    bonus: 1,
    load: 1,
    statMods: [{ stat: "reaction", mod: 1 }],
  });
  const worn = thing({ ...coil, slot: "worn" }, "Coil Suit");
  const r = wornStatBonuses([worn], "reaction");
  assertEquals(r.total, 1);
  assert(r.parts[0].includes("Coil"));
  assertEquals(wornStatBonuses([worn], "morphology").total, 0);
  assertEquals(
    wornStatBonuses([thing(coil, "Coil Suit")], "reaction").total,
    0,
  );
});

Deno.test("gatherBonuses includes worn stats + loadout max", OPTS, () => {
  const c = defaultChar("Neon");
  c.chargenComplete = true;
  c.loadoutMax = 10;
  c.stats.morphology = 1;
  c.stats.reaction = 1;
  const exo = thing(
    {
      ...buildItemData({
        slug: "exo-frame",
        kind: "armor",
        bonus: 1,
        load: 1,
        loadoutMult: 2,
        statMods: [{ stat: "morphology", mod: 1 }],
      }),
      slot: "worn",
    },
    "Exo-frame",
  );
  const g = gatherBonuses(c, "morphology", 0, [], 5, [exo]);
  assertEquals(g.total, 1);
  assert(g.parts.some((p) => p.includes("Exo")));
});
