// tests/eq.test.ts -- unit tests for core/eq.ts helpers.
import { assert, assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import {
  defaultDamageType,
  getEqMeta,
  isArmor,
  isWeapon,
  totalArmorSoak,
  wieldedWeapons,
  wornArmor,
} from "../core/eq.ts";

// deno-lint-ignore no-explicit-any
function item(name: string, state: Record<string, unknown>): any {
  return { id: `i-${name}`, name, state, contents: [] };
}

describe("core/eq", () => {
  it("getEqMeta returns shape, with undefined defaults", () => {
    const empty = getEqMeta({ state: {} });
    assertEquals(empty.kind, undefined);
    assertEquals(empty.worn, undefined);
    assertEquals(empty.damage, undefined);
  });

  it("getEqMeta reads typed fields", () => {
    const sword = item("sword", {
      kind: "weapon", weaponType: "melee", damage: 3, damageType: "L",
    });
    const meta = getEqMeta(sword);
    assertEquals(meta.kind, "weapon");
    assertEquals(meta.weaponType, "melee");
    assertEquals(meta.damage, 3);
    assertEquals(meta.damageType, "L");
  });

  it("isWeapon / isArmor predicates", () => {
    assert(isWeapon(item("sword", { kind: "weapon" })));
    assert(!isWeapon(item("jacket", { kind: "armor" })));
    assert(isArmor(item("jacket", { kind: "armor" })));
    assert(isArmor(item("shield", { kind: "shield" })));
    assert(!isArmor(item("fetish", { kind: "fetish" })));
  });

  it("wieldedWeapons / wornArmor filter correctly", () => {
    const holder = {
      contents: [
        item("sword", { kind: "weapon", wielded: true }),
        item("dagger", { kind: "weapon", wielded: false }),
        item("jacket", { kind: "armor", worn: true }),
        item("helm", { kind: "armor", worn: false }),
        item("shield", { kind: "shield", worn: true }),
        item("misc", { kind: "misc" }),
      ],
    };
    const wielded = wieldedWeapons(holder);
    assertEquals(wielded.length, 1);
    assertEquals(wielded[0].name, "sword");

    const worn = wornArmor(holder);
    assertEquals(worn.length, 2);
    assertEquals(worn.map((w) => w.name).sort(), ["jacket", "shield"].sort());
  });

  it("totalArmorSoak sums armorRating across worn armor", () => {
    const holder = {
      contents: [
        item("jacket", { kind: "armor", worn: true, armorRating: 2 }),
        item("shield", { kind: "shield", worn: true, armorRating: 1 }),
        item("helm",   { kind: "armor", worn: false, armorRating: 3 }), // not worn
        item("sword",  { kind: "weapon", wielded: true, damage: 4 }),
      ],
    };
    assertEquals(totalArmorSoak(holder), 3);
  });

  it("totalArmorSoak is 0 when nothing is worn", () => {
    assertEquals(totalArmorSoak({ contents: [] }), 0);
    assertEquals(totalArmorSoak({}), 0);
  });

  it("defaultDamageType: brawl=B, others=L", () => {
    assertEquals(defaultDamageType("brawl"), "B");
    assertEquals(defaultDamageType("melee"), "L");
    assertEquals(defaultDamageType("firearms"), "L");
    assertEquals(defaultDamageType("thrown"), "L");
  });
});
