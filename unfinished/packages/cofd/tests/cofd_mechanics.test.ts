import { assertEquals, assertStringIncludes, assert } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  defaultSheet,
  setTrait,
  validateTraitValue,
  parseRollExpression,
  executeRoll
} from "../cofd.ts";

describe("CoFD Sheet Operations", () => {
  it("initializes a valid default sheet", () => {
    const sheet = defaultSheet();
    assertEquals(sheet.concept, "Unknown");
    assertEquals(sheet.attributes.strength, 1);
    assertEquals(sheet.skills.athletics, 0);
    assertEquals(sheet.advantages.willpowerMax, 2);
    assertEquals(sheet.advantages.willpowerCurrent, 2);
    assertEquals(sheet.moralityValue, 7);
  });

  it("validates attribute and skill range limits", () => {
    // Valid values
    assertEquals(validateTraitValue("strength", "5"), 5);
    assertEquals(validateTraitValue("athletics", "0"), 0);
    assertEquals(validateTraitValue("integrity", "8"), 8);
    assertEquals(validateTraitValue("concept", "Cool Vampire"), "Cool Vampire");

    // Invalid values should throw
    try {
      validateTraitValue("strength", "0");
      assert(false, "Should have thrown for Strength 0");
    } catch (e) {
      assert(e instanceof Error);
    }

    try {
      validateTraitValue("strength", "11");
      assert(false, "Should have thrown for Strength 11");
    } catch (e) {
      assert(e instanceof Error);
    }

    try {
      validateTraitValue("athletics", "-1");
      assert(false, "Should have thrown for Athletics -1");
    } catch (e) {
      assert(e instanceof Error);
    }
  });

  it("sets attributes and dynamic advantages properly", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "resolve", 3);
    sheet = setTrait(sheet, "composure", 4);

    // Willpower max should auto-refresh to 7
    assertEquals(sheet.attributes.resolve, 3);
    assertEquals(sheet.attributes.composure, 4);
    assertEquals(sheet.advantages.willpowerMax, 7);
  });

  it("handles template transition and custom fields/powers validation and mutation", () => {
    let sheet = defaultSheet();
    assertEquals(sheet.template, "mortal");

    // Transition to Werewolf (a template with dot-rated powers: Renown)
    sheet = setTrait(sheet, "template", "werewolf");
    assertEquals(sheet.template, "werewolf");
    assertEquals(sheet.powerStatValue, 1); // Starts at Primal Urge 1 by default
    assertEquals(sheet.energyCurrent, 10); // Essence max at Primal Urge 1 is 10

    // Set a Forsaken custom field (auspice)
    const auspiceVal = validateTraitValue("auspice", "Rahu", sheet);
    sheet = setTrait(sheet, "auspice", auspiceVal);
    assertEquals(sheet.customFields.auspice, "Rahu");

    // Invalid custom field for WtF should throw
    try {
      validateTraitValue("clan", "Daeva", sheet);
      assert(false, "Should throw for invalid custom field 'clan'");
    } catch (e) {
      assert(e instanceof Error);
      assertStringIncludes(e.message, "Unknown or read-only trait");
    }

    // Set a WtF power (Renown)
    const gloryVal = validateTraitValue("glory", "3", sheet);
    sheet = setTrait(sheet, "glory", gloryVal);
    assertEquals(sheet.powers.glory, 3);

    // Invalid power name for CtL should throw
    try {
      validateTraitValue("vigor", "3", sheet);
      assert(false, "Should throw for invalid power 'vigor'");
    } catch (e) {
      assert(e instanceof Error);
      assertStringIncludes(e.message, "Unknown or read-only trait");
    }
  });
});

describe("CoFD Roll Parser", () => {
  it("parses raw dice pools", () => {
    const sheet = defaultSheet();
    const result = parseRollExpression("8", sheet);
    assertEquals(result.pool, 8);
    assertEquals(result.terms[0], "Raw Pool (8)");
  });

  it("parses attribute + skill combos", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "strength", 3);
    sheet = setTrait(sheet, "athletics", 2);

    const result = parseRollExpression("Strength + Athletics", sheet);
    assertEquals(result.pool, 5);
    assertEquals(result.terms.length, 2);
    assertStringIncludes(result.terms[0], "strength(3)");
    assertStringIncludes(result.terms[1], "athletics(2)");
  });

  it("applies untrained penalty correctly", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "wits", 3);
    // Academics is 0 (Mental untrained penalty is -3)
    const resultMental = parseRollExpression("Wits + Academics", sheet);
    assertEquals(resultMental.pool, 0); // 3 + 0 - 3 untrained = 0
    assertEquals(resultMental.untrainedPenaltyApplied, -3);

    // Brawl is 0 (Physical untrained penalty is -1)
    sheet = setTrait(sheet, "strength", 3);
    const resultPhysical = parseRollExpression("Strength + Brawl", sheet);
    assertEquals(resultPhysical.pool, 2); // 3 + 0 - 1 untrained = 2
    assertEquals(resultPhysical.untrainedPenaltyApplied, -1);
  });

  it("applies specialty bonuses correctly", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "dexterity", 3);
    sheet = setTrait(sheet, "crafts", 2);
    sheet.specialties["crafts"] = ["automotive"];

    const result = parseRollExpression("Dexterity + Crafts/automotive", sheet);
    assertEquals(result.pool, 6); // 3 + 2 + 1 specialty = 6
    assertEquals(result.appliedSpecialties[0], "crafts/automotive");
  });

  it("handles modifiers", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "strength", 3);
    const result = parseRollExpression("Strength + 2", sheet);
    assertEquals(result.pool, 5);
    assertEquals(result.terms[1], "+2");
  });

  it("parses template-specific powers and attributes in roll expressions", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "werewolf");
    sheet = setTrait(sheet, "strength", 3);
    sheet = setTrait(sheet, "brawl", 2);
    sheet = setTrait(sheet, "glory", 2);

    const result = parseRollExpression("Strength + Brawl + Glory", sheet);
    assertEquals(result.pool, 7);
    assertEquals(result.terms.length, 3);
    assertStringIncludes(result.terms[0], "strength(3)");
    assertStringIncludes(result.terms[1], "brawl(2)");
    assertStringIncludes(result.terms[2], "Glory(2)");
  });
});

describe("CoFD D10 10-Again Roller", () => {
  it("rolls positive pools correctly", () => {
    const result = executeRoll(5);
    assertEquals(result.isChanceDie, false);
    assert(result.rolls.length >= 5);
    // Successes must equal the count of rolls >= 8
    const expectedSuccesses = result.rolls.filter(r => r >= 8).length;
    assertEquals(result.successes, expectedSuccesses);
  });

  it("triggers chance die for pools <= 0", () => {
    const result = executeRoll(0);
    assertEquals(result.isChanceDie, true);
    assertEquals(result.rolls.length, 1);

    if (result.rolls[0] === 10) {
      assertEquals(result.successes, 1);
      assertEquals(result.dramaticFailure, false);
    } else if (result.rolls[0] === 1) {
      assertEquals(result.successes, 0);
      assertEquals(result.dramaticFailure, true);
    } else {
      assertEquals(result.successes, 0);
      assertEquals(result.dramaticFailure, false);
    }
  });
});

describe("CoFD Merits and Core Resetting", () => {
  it("allows setting a merit with valid dots and throws for invalid dots", () => {
    let sheet = defaultSheet();
    // Merit: 'giant' is a 4-dot merit
    const giantVal = validateTraitValue("giant", "4", sheet);
    sheet = setTrait(sheet, "giant", giantVal);
    assertEquals(sheet.merits["giant"], 4);

    // Invalid dots (e.g. giant at 3) should throw
    try {
      validateTraitValue("giant", "3", sheet);
      assert(false, "Should throw for invalid merit dots");
    } catch (e) {
      assert(e instanceof Error);
      assertStringIncludes(e.message, "only allows ratings of: 4");
    }
  });

  it("checks single prerequisite criteria (attributes, skills, etc.)", () => {
    let sheet = defaultSheet();
    
    // Merit: 'iron stamina' requires Stamina 3. By default Stamina is 1.
    try {
      validateTraitValue("iron stamina", "2", sheet);
      assert(false, "Should throw because Stamina is 1, less than 3");
    } catch (e) {
      assert(e instanceof Error);
      assertStringIncludes(e.message.toLowerCase(), "requires stamina >= 3");
    }

    // Set stamina to 3, now it should validate
    sheet = setTrait(sheet, "stamina", 3);
    const validIron = validateTraitValue("iron stamina", "2", sheet);
    sheet = setTrait(sheet, "iron stamina", validIron);
    assertEquals(sheet.merits["iron stamina"], 2);
  });

  it("checks compound and complex template-specific prerequisites", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "changeling");

    // Merit: 'unseen sense' requires Template: mortal. Our template is changeling.
    try {
      validateTraitValue("unseen sense", "3", sheet);
      assert(false, "Should throw because template is changeling");
    } catch (e) {
      assert(e instanceof Error);
      assertStringIncludes(e.message.toLowerCase(), "requires template = mortal");
    }

    // Merit: 'fleet of foot' requires Athletics 2. Athletics is 0.
    try {
      validateTraitValue("fleet of foot", "2", sheet);
      assert(false, "Should throw due to athletics < 2");
    } catch (e) {
      assert(e instanceof Error);
      assertStringIncludes(e.message.toLowerCase(), "requires athletics >= 2");
    }

    // Set athletics to 2, now fleet of foot should pass
    sheet = setTrait(sheet, "athletics", 2);
    const fleetVal = validateTraitValue("fleet of foot", "2", sheet);
    sheet = setTrait(sheet, "fleet of foot", fleetVal);
    assertEquals(sheet.merits["fleet of foot"], 2);
  });

  it("resets traits to default/empty values when blank or empty string is provided", () => {
    let sheet = defaultSheet();
    
    // Set a merit and custom fields
    sheet = setTrait(sheet, "template", "werewolf");
    sheet = setTrait(sheet, "auspice", "Rahu");
    sheet = setTrait(sheet, "giant", 3);
    sheet = setTrait(sheet, "glory", 2);
    sheet = setTrait(sheet, "concept", "Night Stalker");

    assertEquals(sheet.customFields.auspice, "Rahu");
    assertEquals(sheet.merits["giant"], 3);
    assertEquals(sheet.powers["glory"], 2);
    assertEquals(sheet.concept, "Night Stalker");

    // Reset them
    sheet = setTrait(sheet, "auspice", validateTraitValue("auspice", "", sheet));
    sheet = setTrait(sheet, "giant", validateTraitValue("giant", "", sheet));
    sheet = setTrait(sheet, "glory", validateTraitValue("glory", "", sheet));
    sheet = setTrait(sheet, "concept", validateTraitValue("concept", "", sheet));

    // Assert resets occurred
    assertEquals(sheet.customFields.auspice, undefined);
    assertEquals(sheet.merits["giant"], undefined);
    assertEquals(sheet.powers["glory"], undefined);
    assertEquals(sheet.concept, ""); // Concept resets to empty string
  });
});
