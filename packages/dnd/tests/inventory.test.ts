import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { getAbilityMod } from "../src/stats/dnd_sheet.ts";

function calculateACForTest(
  abilities: { dexterity: number },
  armor: { ac: number; armorType: string } | null,
  shield: { ac: number } | null
): number {
  const dexMod = getAbilityMod(abilities.dexterity);
  let baseAc = 10;
  
  if (armor) {
    const armorAc = armor.ac;
    const armorType = armor.armorType;
    if (armorType === "light") {
      baseAc = armorAc + dexMod;
    } else if (armorType === "medium") {
      baseAc = armorAc + Math.min(2, dexMod);
    } else if (armorType === "heavy") {
      baseAc = armorAc;
    }
  } else {
    baseAc = 10 + dexMod;
  }

  if (shield) {
    baseAc += shield.ac;
  }
  return baseAc;
}

describe("D&D Equipment AC Math", () => {
  it("calculates AC with no armor (10 + Dex mod)", () => {
    const abilities = { dexterity: 14 }; // +2
    const ac = calculateACForTest(abilities, null, null);
    assertEquals(ac, 12);
  });

  it("calculates AC with Light Armor (base AC + Dex mod)", () => {
    const abilities = { dexterity: 16 }; // +3
    const armor = { ac: 11, armorType: "light" }; // Leather
    const ac = calculateACForTest(abilities, armor, null);
    assertEquals(ac, 14);
  });

  it("calculates AC with Medium Armor (base AC + Dex mod capped at +2)", () => {
    const abilities = { dexterity: 18 }; // +4
    const armor = { ac: 14, armorType: "medium" }; // Scale Mail
    const ac = calculateACForTest(abilities, armor, null);
    assertEquals(ac, 16); // 14 + min(2, 4) = 16
  });

  it("calculates AC with Heavy Armor (base AC, ignores Dex)", () => {
    const abilities = { dexterity: 14 }; // +2
    const armor = { ac: 18, armorType: "heavy" }; // Plate
    const ac = calculateACForTest(abilities, armor, null);
    assertEquals(ac, 18);
  });

  it("calculates AC with shield (+2 AC)", () => {
    const abilities = { dexterity: 14 }; // +2
    const armor = { ac: 11, armorType: "light" }; // Leather
    const shield = { ac: 2 };
    const ac = calculateACForTest(abilities, armor, shield);
    assertEquals(ac, 15); // 11 + 2 + 2 = 15
  });
});
