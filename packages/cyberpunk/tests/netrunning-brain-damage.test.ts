/**
 * Tests — Netrunning Brain Damage (CPR Core errata p.204)
 *
 * "Brain damage is applied directly to HP and is not affected by worn or
 *  implanted armor. It cannot cause a Critical Injury."
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { applyBrainDamage } from "../engine/netrunning.ts";
import { buildNewCharacter } from "../engine/character.ts";
import type { IArmorState } from "../db/schemas.ts";

const fullArmor = (sp: number, name = "Heavy Armorjack"): IArmorState => ({
  name,
  sp,
  currentSp: sp,
  penalty: -2,
});

describe("applyBrainDamage()", () => {
  it("10 brain damage to a fully armored netrunner reduces HP by exactly 10", () => {
    const char = buildNewCharacter("netrunner");
    char.armorBody = fullArmor(13);
    char.armorHead = fullArmor(13, "Heavy Helmet");
    char.subdermalArmorSp = 11;
    const startHp = char.hp.current;

    const result = applyBrainDamage(char, 10);

    assertEquals(result.amount, 10);
    assertEquals(result.newHp, startHp - 10);
    assertEquals(result.char.hp.current, startHp - 10);
  });

  it("does not ablate or consult worn armor SP", () => {
    const char = buildNewCharacter("netrunner");
    char.armorBody = fullArmor(13);
    char.subdermalArmorSp = 11;

    const result = applyBrainDamage(char, 10);

    assertEquals(result.char.armorBody?.currentSp, 13);
    assertEquals(result.char.subdermalArmorSp, 11);
    assertEquals(result.bypassedArmor, true);
  });

  it("never triggers a critical injury roll", () => {
    const char = buildNewCharacter("netrunner");
    const startCrits = char.criticalInjuries.length;

    const result = applyBrainDamage(char, 25);

    assertEquals(result.critInjuryRolled, false);
    assertEquals(result.char.criticalInjuries.length, startCrits);
  });

  it("still updates wound state when crossing SW threshold", () => {
    const char = buildNewCharacter("netrunner");
    const sw = char.swThreshold;
    const dmg = char.hp.current - sw + 1;

    const result = applyBrainDamage(char, dmg);

    assertEquals(result.newWoundState, "seriously");
  });

  it("can drive a netrunner to mortally wounded", () => {
    const char = buildNewCharacter("netrunner");

    const result = applyBrainDamage(char, char.hp.current);

    assertEquals(result.newHp, 0);
    assertEquals(result.newWoundState, "mortally");
  });

  it("floors negative input at 0 (no healing via brain damage)", () => {
    const char = buildNewCharacter("netrunner");
    const startHp = char.hp.current;

    const result = applyBrainDamage(char, -5);

    assertEquals(result.amount, 0);
    assertEquals(result.newHp, startHp);
  });
});
