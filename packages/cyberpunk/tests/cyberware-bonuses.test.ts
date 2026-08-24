/**
 * Tests — Cyberware Passive Bonuses
 * Covers: getCyberwareSkillBonus, Grafted Muscle BODY recalc, Subdermal Armor SP
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { getCyberwareSkillBonus, buildNewCharacter, recalcDerived, calcMaxHP, calcSWThreshold } from "../engine/character.ts";
import { effectiveSP, ablateArmorSource } from "../engine/combat.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCyberware(names: string[]): Array<{ name: string }> {
  return names.map((name) => ({ name }));
}

// ── getCyberwareSkillBonus ────────────────────────────────────────────────────

describe("getCyberwareSkillBonus()", () => {
  it("image_enhance gives +2 to perception", () => {
    const cw = makeCyberware(["image_enhance"]);
    assertEquals(getCyberwareSkillBonus(cw, "perception"), 2);
  });

  it("image_enhance gives 0 to unrelated skills", () => {
    const cw = makeCyberware(["image_enhance"]);
    assertEquals(getCyberwareSkillBonus(cw, "stealth"), 0);
  });

  it("voice_stress_analyzer gives +2 to human_perception", () => {
    const cw = makeCyberware(["voice_stress_analyzer"]);
    assertEquals(getCyberwareSkillBonus(cw, "human_perception"), 2);
  });

  it("voice_stress_analyzer gives +2 to interrogation", () => {
    const cw = makeCyberware(["voice_stress_analyzer"]);
    assertEquals(getCyberwareSkillBonus(cw, "interrogation"), 2);
  });

  it("amplified_hearing gives +2 to perception", () => {
    const cw = makeCyberware(["amplified_hearing"]);
    assertEquals(getCyberwareSkillBonus(cw, "perception"), 2);
  });

  it("no relevant cyberware returns 0", () => {
    const cw = makeCyberware(["neural_link", "pain_editor"]);
    assertEquals(getCyberwareSkillBonus(cw, "perception"), 0);
  });

  it("empty cyberware list returns 0", () => {
    assertEquals(getCyberwareSkillBonus([], "perception"), 0);
  });

  it("two bonus cyberware for same skill stack additively", () => {
    // image_enhance (+2) + amplified_hearing (+2) → +4 to perception
    const cw = makeCyberware(["image_enhance", "amplified_hearing"]);
    assertEquals(getCyberwareSkillBonus(cw, "perception"), 4);
  });
});

// ── Grafted Muscle BODY recalc ────────────────────────────────────────────────

describe("Grafted Muscle BODY recalc", () => {
  it("BODY increases by 2 on install (simulated via recalcDerived)", () => {
    const char = buildNewCharacter("solo");
    // Simulate install: bump BODY by 2
    const newBody = char.stats.body + 2;
    const updated = recalcDerived({ ...char, stats: { ...char.stats, body: newBody } });
    assertEquals(updated.stats.body, 7); // 5 + 2
    const expectedHp = calcMaxHP(7, char.stats.will);
    assertEquals(updated.hp.max, expectedHp);
    assertEquals(updated.deathSave, 7);
    assertEquals(updated.swThreshold, calcSWThreshold(expectedHp));
  });

  it("BODY is capped at 10 (max 10 total)", () => {
    const char = buildNewCharacter("solo");
    // Set BODY to 9 — grafted muscle would push to 11, cap at 10
    const baseBody = 9;
    const newBody = Math.min(10, baseBody + 2);
    const updated = recalcDerived({ ...char, stats: { ...char.stats, body: newBody } });
    assertEquals(updated.stats.body, 10);
  });

  it("BODY at max 10 produces correct derived stats", () => {
    const char = buildNewCharacter("solo");
    const updated = recalcDerived({ ...char, stats: { ...char.stats, body: 10 } });
    const expectedHp = calcMaxHP(10, char.stats.will);
    assertEquals(updated.hp.max, expectedHp);
    assertEquals(updated.deathSave, 10);
    assertEquals(updated.swThreshold, calcSWThreshold(expectedHp));
  });
});

// ── Subdermal Armor SP ────────────────────────────────────────────────────────

describe("effectiveSP() — Subdermal Armor", () => {
  it("uses subdermal SP (11) when no worn armor", () => {
    const char = buildNewCharacter("solo");
    const charWithSubdermal = { ...char, armorBody: null, subdermalArmorSp: 11 };
    assertEquals(effectiveSP(charWithSubdermal, "body"), 11);
  });

  it("uses worn armor SP (13) when higher than subdermal (11)", () => {
    const char = buildNewCharacter("solo");
    const charWithBoth = {
      ...char,
      armorBody: { name: "heavy_armorjack", sp: 13, currentSp: 13, penalty: -2 },
      subdermalArmorSp: 11,
    };
    assertEquals(effectiveSP(charWithBoth, "body"), 13);
  });

  it("does not stack: uses max, not sum", () => {
    const char = buildNewCharacter("solo");
    const charWithBoth = {
      ...char,
      armorBody: { name: "light_armorjack", sp: 11, currentSp: 11, penalty: -1 },
      subdermalArmorSp: 11,
    };
    // Both are 11 — result must be 11, not 22
    assertEquals(effectiveSP(charWithBoth, "body"), 11);
  });

  it("subdermal 0 with worn 8 → uses worn 8", () => {
    const char = buildNewCharacter("solo");
    const charWithWorn = {
      ...char,
      armorBody: { name: "leather", sp: 8, currentSp: 8, penalty: 0 },
      subdermalArmorSp: 0,
    };
    assertEquals(effectiveSP(charWithWorn, "body"), 8);
  });
});

// ── ablateArmorSource ─────────────────────────────────────────────────────────

describe("ablateArmorSource()", () => {
  it("ablates subdermal when subdermal SP is higher", () => {
    const char = buildNewCharacter("solo");
    const c = {
      ...char,
      armorBody: { name: "light_armorjack", sp: 11, currentSp: 5, penalty: -1 },
      subdermalArmorSp: 11,
    };
    const result = ablateArmorSource(c, "body");
    assertEquals(result.source, "subdermal");
    assertEquals(result.newSp, 10);
  });

  it("ablates worn when worn SP is higher", () => {
    const char = buildNewCharacter("solo");
    const c = {
      ...char,
      armorBody: { name: "heavy_armorjack", sp: 13, currentSp: 13, penalty: -2 },
      subdermalArmorSp: 11,
    };
    const result = ablateArmorSource(c, "body");
    assertEquals(result.source, "worn");
    assertEquals(result.newSp, 12);
  });

  it("head location always ablates worn armor", () => {
    const char = buildNewCharacter("solo");
    const c = {
      ...char,
      armorHead: { name: "helmet", sp: 7, currentSp: 7, penalty: -1 },
      subdermalArmorSp: 11,
    };
    const result = ablateArmorSource(c, "head");
    assertEquals(result.source, "worn");
    assertEquals(result.newSp, 6);
  });
});
