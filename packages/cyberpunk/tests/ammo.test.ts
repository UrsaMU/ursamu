/**
 * Tests — Ammunition resolution helpers.
 */
import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  AMMO, getAmmo, ammoForWeaponType, defaultAmmoForWeaponType,
  effectiveSpForAmmo, finalDamageForAmmo, canHarmTarget,
  isNonLethal, onHitEffects, requiresSmartgunLink,
} from "../data/ammo.ts";
import { getWeapon } from "../data/weapons.ts";

describe("ammo catalog", () => {
  it("has at least 7 standard types", () => {
    assert(AMMO.length >= 7);
  });
  it("getAmmo() normalizes casing and dashes", () => {
    assertEquals(getAmmo("Armor-Piercing")?.id, "armor_piercing");
    assertEquals(getAmmo("basic")?.id, "basic");
  });
  it("returns ammo for a pistol weapon type", () => {
    const ids = ammoForWeaponType("pistol").map((a) => a.id);
    assert(ids.includes("basic"));
    assert(ids.includes("armor_piercing"));
  });
  it("default ammo for grenades and rockets is AP", () => {
    assertEquals(defaultAmmoForWeaponType("grenade"), "armor_piercing");
    assertEquals(defaultAmmoForWeaponType("explosive"), "armor_piercing");
    assertEquals(defaultAmmoForWeaponType("pistol"), "basic");
  });
});

describe("effectiveSpForAmmo()", () => {
  it("AP halves SP, round down", () => {
    assertEquals(effectiveSpForAmmo("armor_piercing", 11), 5);
    assertEquals(effectiveSpForAmmo("armor_piercing", 0), 0);
  });
  it("basic leaves SP unchanged", () => {
    assertEquals(effectiveSpForAmmo("basic", 11), 11);
  });
});

describe("finalDamageForAmmo()", () => {
  it("AP vs. light/medium halves damage", () => {
    assertEquals(finalDamageForAmmo("armor_piercing", 13, "light"), 6);
    assertEquals(finalDamageForAmmo("armor_piercing", 13, "medium"), 6);
  });
  it("AP vs. heavy/metal does NOT halve damage", () => {
    assertEquals(finalDamageForAmmo("armor_piercing", 13, "heavy"), 13);
    assertEquals(finalDamageForAmmo("armor_piercing", 13, "metal"), 13);
  });
  it("Expansive doubles vs unarmored", () => {
    assertEquals(finalDamageForAmmo("expansive", 7, "none"), 14);
  });
  it("Expansive unchanged otherwise (but blocked by canHarmTarget)", () => {
    assertEquals(finalDamageForAmmo("expansive", 7, "light"), 7);
  });
});

describe("canHarmTarget()", () => {
  it("expansive cannot harm armored", () => {
    assertEquals(canHarmTarget("expansive", "light"), false);
    assertEquals(canHarmTarget("expansive", "none"), true);
  });
  it("other ammo always allowed", () => {
    assertEquals(canHarmTarget("basic", "metal"), true);
    assertEquals(canHarmTarget("armor_piercing", "heavy"), true);
  });
});

describe("rubber + smart + effects", () => {
  it("rubber is non-lethal", () => {
    assert(isNonLethal("rubber"));
    assert(!isNonLethal("basic"));
  });
  it("smart requires smartgun link", () => {
    assert(requiresSmartgunLink("smart"));
    assert(!requiresSmartgunLink("basic"));
  });
  it("incendiary produces a burn effect", () => {
    const fx = onHitEffects("incendiary");
    assertEquals(fx[0].effect, "burn");
  });
  it("basic produces no effects", () => {
    assertEquals(onHitEffects("basic").length, 0);
  });
});

describe("grenade catalog additions", () => {
  it("frag_grenade exists with 6d6 in 10m radius", () => {
    const g = getWeapon("frag_grenade");
    assert(g);
    assertEquals(g!.damageDice, 6);
    assertEquals(g!.areaRadius, 10);
    assertEquals(g!.thrown, true);
  });
  it("rpg_ap exists with 8d6", () => {
    const r = getWeapon("rpg_ap");
    assert(r);
    assertEquals(r!.damageDice, 8);
    assertEquals(r!.type, "explosive");
  });
  it("flashbang has an aoe save", () => {
    const g = getWeapon("flashbang");
    assertEquals(g!.aoeSave?.effect, "blinded");
  });
  it("smoke_grenade deals no damage", () => {
    assertEquals(getWeapon("smoke_grenade")!.damageDice, 0);
  });
});
