import { assert, assertEquals } from "@std/assert";
import {
  buildItemData,
  combatGearBonusFromItems,
  hostCombatBonus,
  repairItemData,
} from "../engine/items.ts";
import { attackModeTags } from "../engine/action.ts";
import { pickPrimaryWeapon } from "../commands/attack-shared.ts";
import type { IDBObj } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("hostCombatBonus defaults firearms to +1", OPTS, () => {
  const d = buildItemData({
    slug: "orchard-technologies-machine-link",
    kind: "firearm",
    load: 1,
    // no bonus field
  });
  assertEquals(d.bonus, undefined);
  assertEquals(hostCombatBonus(d), 1);
});

Deno.test("combatGearBonus includes default +1 gun", OPTS, () => {
  const d = buildItemData({
    slug: "orchard-technologies-machine-link",
    kind: "firearm",
    load: 1,
  });
  d.slot = "wielded";
  const g = combatGearBonusFromItems([
    {
      name: "Orchard Technologies® Machine Link",
      flags: new Set(["thing"]),
      state: { sprawl_item: d },
    },
  ], { actionTags: attackModeTags("shot") });
  assertEquals(g.total, 1);
  assert(g.parts.some((p) => p.includes("+1")));
});

Deno.test("market kind=gear gun is repaired to firearm +1", OPTS, () => {
  const raw = buildItemData({
    slug: "orchard-technologies-machine-link",
    kind: "gear",
    load: 1,
  });
  assertEquals(raw.kind, "gear");
  // hostCombatBonus repairs via market category
  assertEquals(hostCombatBonus(raw), 1);
  const { data, changed } = repairItemData(raw, {
    name: "Orchard Technologies® Machine Link",
  });
  assert(changed);
  assertEquals(data.kind, "firearm");
  assertEquals(hostCombatBonus(data), 1);

  const obj = {
    id: "g1",
    name: "Orchard Technologies® Machine Link",
    flags: new Set(["thing"]),
    location: "p1",
    contents: [],
    state: { sprawl_item: raw },
  } as unknown as IDBObj;
  const g = combatGearBonusFromItems([obj], {
    actionTags: attackModeTags("shot"),
  });
  assertEquals(g.total, 1);
  assert(g.parts.some((p) => p.includes("+1")));
  const prim = pickPrimaryWeapon([obj], false);
  assert(prim);
});

Deno.test("explicit bonus 0 on firearm still counts +1", OPTS, () => {
  assertEquals(
    hostCombatBonus({
      slug: "pkd-45",
      kind: "firearm",
      load: 1,
      bonus: 0,
    }),
    1,
  );
});
