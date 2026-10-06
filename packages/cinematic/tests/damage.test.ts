/** Damage resolution order + equipment data tests. */
import { assertEquals } from "@std/assert";
import {
  TYPE_MULT,
  baseDamage,
  resolveDamage,
} from "../src/damage.ts";
import { ARMOR, WEAPONS, armorDef, weaponDef } from "../src/data.ts";
import { armorAttrs, weaponAttrs } from "../commands/gear.ts";

Deno.test("baseDamage — formulas vs fixed", () => {
  assertEquals(baseDamage(weaponDef("baton")!, 3), 9);
  assertEquals(baseDamage(weaponDef("quarterstaff")!, 3), 12);
  assertEquals(baseDamage(weaponDef("pistol")!, 3), 12);
  assertEquals(baseDamage(weaponDef("axe")!, 4), 20);
});

Deno.test("damage order — SLs added before armor, then multiplier", () => {
  // Sword (4xStr), Str 3 -> 12 base; +3 SL = 15; -2 jacket slash = 13; x2 = 26
  const r = resolveDamage({
    weapon: "sword",
    strength: 3,
    successLevels: 3,
    armor: "leather-jacket",
  });
  assertEquals(r.base, 12);
  assertEquals(r.afterSl, 15);
  assertEquals(r.afterArmor, 13);
  assertEquals(r.multiplier, 2);
  assertEquals(r.final, 26);
});

Deno.test("damage order — bash vs bulletproof vest columns", () => {
  // Baton 3xStr4=12, +2 SL=14, vest bash 10 -> 4, x1 = 4
  const bash = resolveDamage({
    weapon: "baton",
    strength: 4,
    successLevels: 2,
    armor: "bulletproof-vest",
  });
  assertEquals(bash.final, 4);
  // Pistol 12, +0 SL, vest bullet 10 -> 2, x2 = 4
  const bullet = resolveDamage({
    weapon: "pistol",
    strength: 0,
    successLevels: 0,
    armor: "bulletproof-vest",
  });
  assertEquals(bullet.final, 4);
});

Deno.test("damage — special multiplier replaces type multiplier", () => {
  // Stake 2xStr2=4, +1 SL=5, no armor, Through the Heart x5
  const r = resolveDamage({
    weapon: "stake",
    strength: 2,
    successLevels: 1,
    typeMultiplier: 5,
  });
  assertEquals(r.afterArmor, 5);
  assertEquals(r.final, 25);
});

Deno.test("damage — armor cannot reduce below zero", () => {
  const r = resolveDamage({
    weapon: "knife",
    strength: 1,
    successLevels: 0,
    armor: "combat-armor",
  });
  assertEquals(r.afterArmor, 0);
  assertEquals(r.final, 0);
});

Deno.test("damage — unknown weapon is zeroed", () => {
  const r = resolveDamage({
    weapon: "phaser",
    strength: 5,
    successLevels: 5,
  });
  assertEquals(r.final, 0);
});

Deno.test("type multipliers — bash 1, slash 2, bullet 2", () => {
  assertEquals(TYPE_MULT["Bash"], 1);
  assertEquals(TYPE_MULT["Slash/stab"], 2);
  assertEquals(TYPE_MULT["Bullet"], 2);
});

Deno.test("equipment data — slugs unique, fields sane", () => {
  assertEquals(new Set(WEAPONS.map((w) => w.slug)).size, WEAPONS.length);
  assertEquals(new Set(ARMOR.map((a) => a.slug)).size, ARMOR.length);
  for (const w of WEAPONS) {
    assertEquals(typeof w.type, "string");
    assertEquals([1, 2].includes(w.hands), true);
  }
  for (const a of ARMOR) {
    for (const v of Object.values(a.protection)) {
      assertEquals(typeof v, "number");
    }
  }
  assertEquals(armorDef("chain-mail")?.protection.bullet, 4);
});

Deno.test("gear attrs — &key=value pairs", () => {
  const w = weaponAttrs(weaponDef("quarterstaff")!);
  assertEquals(w[0], ["dmg", "3x(Strength+1)"]);
  assertEquals(w[1], ["type", "Bash"]);
  const a = armorAttrs(armorDef("chain-mail")!);
  assertEquals(a[0], ["bash", "8"]);
  assertEquals(a[3], ["coverage", "Torso"]);
});
