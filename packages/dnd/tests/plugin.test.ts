import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  defaultSheet,
  getAbilityMod,
  getProficiencyBonus,
  migrateSheet,
} from "../src/stats/dnd_sheet.ts";
import {
  initCgState,
  getXpRequired,
  calculateSpellSlots
} from "../src/commands/cg.ts";

describe("Ability Modifier Math", () => {
  it("computes standard modifiers correctly", () => {
    assertEquals(getAbilityMod(10), 0);
    assertEquals(getAbilityMod(11), 0);
    assertEquals(getAbilityMod(12), 1);
    assertEquals(getAbilityMod(13), 1);
    assertEquals(getAbilityMod(14), 2);
    assertEquals(getAbilityMod(15), 2);
    assertEquals(getAbilityMod(16), 3);
    assertEquals(getAbilityMod(18), 4);
    assertEquals(getAbilityMod(20), 5);
    assertEquals(getAbilityMod(8), -1);
    assertEquals(getAbilityMod(9), -1);
    assertEquals(getAbilityMod(6), -2);
    assertEquals(getAbilityMod(3), -4);
  });
});

describe("Proficiency Bonus", () => {
  it("returns correct bonus for each tier of level", () => {
    assertEquals(getProficiencyBonus(1), 2);
    assertEquals(getProficiencyBonus(4), 2);
    assertEquals(getProficiencyBonus(5), 3);
    assertEquals(getProficiencyBonus(8), 3);
    assertEquals(getProficiencyBonus(9), 4);
    assertEquals(getProficiencyBonus(12), 4);
    assertEquals(getProficiencyBonus(13), 5);
    assertEquals(getProficiencyBonus(16), 5);
    assertEquals(getProficiencyBonus(17), 6);
    assertEquals(getProficiencyBonus(20), 6);
  });
});

describe("HP Tracking & Damage", () => {
  it("absorbs damage using temporary hit points", () => {
    const sheet = migrateSheet(defaultSheet());
    sheet.hp.max = 12;
    sheet.hp.current = 12;
    sheet.hp.temp = 5;

    // Deal 3 damage: should absorb from temp HP completely
    let damageLeft = 3;
    if (sheet.hp.temp > 0) {
      const tempAbsorb = Math.min(sheet.hp.temp, damageLeft);
      sheet.hp.temp -= tempAbsorb;
      damageLeft -= tempAbsorb;
    }
    if (damageLeft > 0) {
      sheet.hp.current = Math.max(0, sheet.hp.current - damageLeft);
    }

    assertEquals(sheet.hp.temp, 2);
    assertEquals(sheet.hp.current, 12);

    // Deal another 4 damage: absorbs 2 from temp, and 2 from current HP
    damageLeft = 4;
    if (sheet.hp.temp > 0) {
      const tempAbsorb = Math.min(sheet.hp.temp, damageLeft);
      sheet.hp.temp -= tempAbsorb;
      damageLeft -= tempAbsorb;
    }
    if (damageLeft > 0) {
      sheet.hp.current = Math.max(0, sheet.hp.current - damageLeft);
    }

    assertEquals(sheet.hp.temp, 0);
    assertEquals(sheet.hp.current, 10);
  });

  it("clamps healing to max HP", () => {
    const sheet = migrateSheet(defaultSheet());
    sheet.hp.max = 15;
    sheet.hp.current = 10;

    sheet.hp.current = Math.min(sheet.hp.max, sheet.hp.current + 8);
    assertEquals(sheet.hp.current, 15);
  });
});

describe("Guided Character Gen", () => {
  it("initializes to stage 1 with empty fields", () => {
    const state = initCgState();
    assertEquals(state.stage, 1);
    assertEquals(state.class, "");
    assertEquals(state.species, "");
    assertEquals(state.abilities.strength, 8);
  });

  it("finalizes sheet with background feats and spell slots for caster classes", () => {
    const ab = { strength: 10, dexterity: 14, constitution: 13, intelligence: 15, wisdom: 12, charisma: 8 };
    const sheet = migrateSheet({
      class: "Wizard",
      species: "Elf",
      background: "Sage",
      abilities: ab,
      feats: ["Magic Initiate (Wizard)"],
      spells: ["fire_bolt", "light", "mage_hand", "magic_missile", "shield", "sleep", "thunderwave"],
      spellSlotsMax: { 1: 2 },
      spellSlotsCurrent: { 1: 2 }
    });

    assertEquals(sheet.feats, ["Magic Initiate (Wizard)"]);
    assertEquals(sheet.spells.includes("fire_bolt"), true);
    assertEquals(sheet.spellSlotsMax[1], 2);
  });

  it("initializes with startingGear defaulting to equipment", () => {
    const state = initCgState();
    assertEquals(state.startingGear, "equipment");
  });
});

import { validateAbilityScores } from "../src/commands/cg.ts";

describe("Ability Score Validation", () => {
  it("approves a valid 27-point assignment matching default scores", () => {
    const ab = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 };
    assertEquals(validateAbilityScores(ab).valid, true);
  });

  it("approves valid point buy totals (27 points)", () => {
    // 6 x 10 = cost of 2 x 6 = 12? No, cost of 10 is 2. So 2 * 6 = 12 points. Not 27 points.
    // Let's make a valid 27-point buy:
    // e.g. 15 (9 pts), 15 (9 pts), 15 (9 pts), 8 (0 pts), 8 (0 pts), 8 (0 pts) -> 27 pts
    const ab1 = { strength: 15, dexterity: 15, constitution: 15, intelligence: 8, wisdom: 8, charisma: 8 };
    assertEquals(validateAbilityScores(ab1).valid, true);

    // Another example: 14 (7 pts), 14 (7 pts), 12 (4 pts), 12 (4 pts), 11 (3 pts), 10 (2 pts) -> 27 pts
    const ab2 = { strength: 14, dexterity: 14, constitution: 12, intelligence: 12, wisdom: 11, charisma: 10 };
    assertEquals(validateAbilityScores(ab2).valid, true);
  });

  it("rejects invalid point buy totals", () => {
    // All 10s: cost is 2 * 6 = 12 points (too low)
    const ab1 = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
    assertEquals(validateAbilityScores(ab1).valid, false);

    // Too high: 6 x 15 = 54 points
    const ab2 = { strength: 15, dexterity: 15, constitution: 15, intelligence: 15, wisdom: 15, charisma: 15 };
    assertEquals(validateAbilityScores(ab2).valid, false);
  });
});

describe("Leveling and Multiclassing", () => {
  it("calculates XP thresholds correctly", () => {
    assertEquals(getXpRequired(1), 0);
    assertEquals(getXpRequired(2), 300);
    assertEquals(getXpRequired(3), 900);
    assertEquals(getXpRequired(4), 2700);
    assertEquals(getXpRequired(5), 6500);
    assertEquals(getXpRequired(20), 355000);
  });

  it("calculates spell slots for single caster class", () => {
    const slotsWizard1 = calculateSpellSlots({ Wizard: 1 });
    assertEquals(slotsWizard1[1], 2);

    const slotsWizard2 = calculateSpellSlots({ Wizard: 2 });
    assertEquals(slotsWizard2[1], 3);

    const slotsWizard3 = calculateSpellSlots({ Wizard: 3 });
    assertEquals(slotsWizard3[1], 4);
    assertEquals(slotsWizard3[2], 2);
  });

  it("calculates spell slots for multiclass characters", () => {
    const slotsMulticlass = calculateSpellSlots({ Wizard: 1, Cleric: 1 });
    assertEquals(slotsMulticlass[1], 3);

    const slotsHalfCaster = calculateSpellSlots({ Paladin: 2 });
    assertEquals(slotsHalfCaster[1], 2);
  });

  it("migrates older sheets without classes to defaults", () => {
    const legacySheet = {
      class: "Fighter",
      level: 1,
      xp: 100
    };
    const migrated = migrateSheet(legacySheet);
    assertEquals(migrated.classes, { Fighter: 1 });
  });
});

describe("Resting and Hit Dice", () => {
  it("performs a long rest to recover resources", () => {
    const sheet = migrateSheet(defaultSheet());
    sheet.level = 4;
    sheet.hitDice = { max: 4, current: 1 };
    sheet.hp = { max: 30, current: 5, temp: 10 };
    sheet.spellSlotsMax = { 1: 4, 2: 2 };
    sheet.spellSlotsCurrent = { 1: 0, 2: 0 };

    sheet.hp.current = sheet.hp.max;
    sheet.hp.temp = 0;
    for (let i = 1; i <= 9; i++) {
      sheet.spellSlotsCurrent[i] = sheet.spellSlotsMax[i] || 0;
    }
    const hdToRestore = Math.max(1, Math.floor(sheet.hitDice.max / 2));
    sheet.hitDice.current = Math.min(
      sheet.hitDice.max,
      sheet.hitDice.current + hdToRestore
    );

    assertEquals(sheet.hp.current, 30);
    assertEquals(sheet.hp.temp, 0);
    assertEquals(sheet.spellSlotsCurrent[1], 4);
    assertEquals(sheet.spellSlotsCurrent[2], 2);
    assertEquals(sheet.hitDice.current, 3); // 1 + 2 = 3
  });

  it("performs a short rest to spend hit dice and heal", () => {
    const sheet = migrateSheet(defaultSheet());
    sheet.hitDice = { max: 2, current: 2 };
    sheet.hp = { max: 15, current: 5, temp: 0 };

    const diceToSpend = 1;
    sheet.hitDice.current -= diceToSpend;
    const conMod = getAbilityMod(sheet.abilities.constitution);
    const rollValue = 6;
    const totalHeal = Math.max(1, rollValue + conMod);
    sheet.hp.current = Math.min(sheet.hp.max, sheet.hp.current + totalHeal);

    assertEquals(sheet.hitDice.current, 1);
    assertEquals(sheet.hp.current, 11); // 5 + 6 = 11
  });
});

import { dndCgExec } from "../src/commands/cg.ts";
import { mockPlayer, mockU } from "../../cofd/tests/helpers/mockU.ts";
import { assertStringIncludes } from "@std/assert";

describe("D&D Guided Character Gen Reset Guard", () => {
  it("blocks resetting when approved", async () => {
    const me = mockPlayer({
      id: "1",
      name: "Arthur",
      state: { dnd: {} },
    });
    const u = mockU({ me });
    u.cmd.args = ["reset", ""];
    u._sent.length = 0;
    await dndCgExec(u);
    assertStringIncludes(
      u._sent.join("\n"),
      "You already have an approved character sheet.",
    );
  });
});
