// tests/validator.test.ts -- Per-step validation + freebie calc
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

// Ensure splat registrations run before tests
import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../splats/kinfolk/index.ts";

import { validateStep, freebiesCost } from "../core/validator.ts";
import { SplatRegistry } from "../core/registry.ts";
import type { IWoDChar } from "../core/types.ts";

function baseChar(): IWoDChar {
  return {
    id: "test-1",
    playerId: "player-1",
    splat: "wta",
    status: "draft",
    chargenStep: 1,
    concept: "",
    attributePriority: ["", "", ""],
    attributes: {},
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {},
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 3,
    freebiesRemaining: 15,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("validateStep 1 -- Sub-template", () => {
  it("fails when all fields empty", () => {
    const b = validateStep(baseChar(), 1);
    assertEquals(b.complete, false);
    assertStringIncludes(b.issues.join(" "), "breed");
  });

  it("passes with breed/auspice/tribe set", () => {
    const char = { ...baseChar(), breed: "homid", auspice: "ahroun", tribe: "fianna" };
    const b = validateStep(char, 1);
    assertEquals(b.complete, true);
    assertEquals(b.issues.length, 0);
  });

  it("fails Red Talons with homid breed", () => {
    const char = { ...baseChar(), breed: "homid", auspice: "ahroun", tribe: "red-talons" };
    const b = validateStep(char, 1);
    assertEquals(b.complete, false);
    assertStringIncludes(b.issues.join(" "), "Red Talons");
  });

  it("passes Red Talons with lupus breed", () => {
    const char = { ...baseChar(), breed: "lupus", auspice: "ahroun", tribe: "red-talons" };
    const b = validateStep(char, 1);
    assertEquals(b.complete, true);
  });

  it("requires deformity for metis", () => {
    const char = { ...baseChar(), breed: "metis", auspice: "theurge", tribe: "uktena" };
    const b = validateStep(char, 1);
    assertStringIncludes(b.issues.join(" "), "deformity");
  });

  it("passes metis with deformity set", () => {
    const char = { ...baseChar(), breed: "metis", auspice: "theurge", tribe: "uktena", deformity: "Crooked spine" };
    const b = validateStep(char, 1);
    assertEquals(b.complete, true);
  });
});

describe("validateStep 2 -- Concept", () => {
  function step1Char(): IWoDChar {
    return { ...baseChar(), breed: "homid", auspice: "ahroun", tribe: "fianna", chargenStep: 2 };
  }

  it("fails when all concept fields are missing", () => {
    const b = validateStep(step1Char(), 2);
    assertEquals(b.complete, false);
    assertStringIncludes(b.issues.join(" "), "full name");
  });

  it("fails when only concept is set (missing fullName/age/nature/demeanor)", () => {
    const char = { ...step1Char(), concept: "Wanderer" };
    const b = validateStep(char, 2);
    assertEquals(b.complete, false);
    assertStringIncludes(b.issues.join(" "), "full name");
  });

  it("passes with all concept fields set", () => {
    const char = {
      ...step1Char(),
      fullName: "Elena Vasquez",
      concept: "Wanderer",
      age: "25",
      nature: "Survivor",
      demeanor: "Loner",
    };
    const b = validateStep(char, 2);
    assertEquals(b.complete, true);
    assertEquals(b.issues.length, 0);
  });
});

describe("validateStep 3 -- Attributes", () => {
  function attrChar(): IWoDChar {
    return {
      ...baseChar(),
      breed: "homid", auspice: "ahroun", tribe: "fianna",
      fullName: "Test Character", concept: "Test", age: "25", nature: "Survivor", demeanor: "Loner",
      chargenStep: 3,
    };
  }

  it("fails without priority set", () => {
    const b = validateStep(attrChar(), 3);
    assertStringIncludes(b.issues[0], "priority");
  });

  it("fails with wrong total dots", () => {
    const char = {
      ...attrChar(),
      attributePriority: ["physical", "social", "mental"] as [string, string, string],
      attributes: { Strength: 3, Dexterity: 2, Stamina: 1 }, // 6 physical, need 7
    };
    const b = validateStep(char, 3);
    assertEquals(b.complete, false);
    assertEquals(b.remaining.physicalDots, 1);
  });

  it("passes with correct 7/5/3 distribution", () => {
    const char = {
      ...attrChar(),
      attributePriority: ["physical", "social", "mental"] as [string, string, string],
      attributes: {
        Strength: 3, Dexterity: 2, Stamina: 2,   // 7 physical
        Charisma: 2, Manipulation: 2, Appearance: 1, // 5 social
        Perception: 1, Intelligence: 1, Wits: 1,  // 3 mental
      },
    };
    const b = validateStep(char, 3);
    assertEquals(b.complete, true);
  });

  it("fails when attribute total exceeds 5", () => {
    const char = {
      ...attrChar(),
      attributePriority: ["physical", "social", "mental"] as [string, string, string],
      attributes: { Strength: 5 }, // base 1 + 5 extra = 6 -- over cap
    };
    const b = validateStep(char, 3);
    assertStringIncludes(b.issues.join(" "), "5");
  });

  it("stays complete after freebie raises attrs past 7/5/3", () => {
    // Step 3 was finished; Step 6 freebies added physical extras.
    const char = {
      ...attrChar(),
      chargenStep: 6 as const,
      attributePriority: ["physical", "social", "mental"] as [
        string,
        string,
        string,
      ],
      attributes: {
        Strength: 4, Dexterity: 3, Stamina: 2, // 9 physical extras
        Charisma: 2, Manipulation: 2, Appearance: 1,
        Perception: 1, Intelligence: 1, Wits: 1,
      },
    };
    const b = validateStep(char, 3);
    assertEquals(b.complete, true, b.issues.join("; "));
  });
});

describe("validateStep 4 -- Abilities", () => {
  function abilChar(): IWoDChar {
    return {
      ...baseChar(),
      breed: "homid", auspice: "ahroun", tribe: "fianna",
      fullName: "Test Character", concept: "Test", age: "25", nature: "Survivor", demeanor: "Loner",
      chargenStep: 4,
      attributePriority: ["physical", "social", "mental"] as [string, string, string],
      attributes: {
        Strength: 3, Dexterity: 2, Stamina: 2,
        Charisma: 2, Manipulation: 2, Appearance: 1,
        Perception: 1, Intelligence: 1, Wits: 1,
      },
    };
  }

  it("fails without ability priority set", () => {
    const b = validateStep(abilChar(), 4);
    assertStringIncludes(b.issues[0], "priority");
  });

  it("fails with ability > 3 at Step 4", () => {
    const char = {
      ...abilChar(),
      abilityPriority: ["talents", "skills", "knowledges"] as [string, string, string],
      abilities: { Brawl: 4 }, // over step cap of 3
    };
    const b = validateStep(char, 4);
    assertStringIncludes(b.issues.join(" "), "3");
  });

  it("allows ability > 3 after freebies (past Step 4)", () => {
    const char = {
      ...abilChar(),
      chargenStep: 6 as const,
      abilityPriority: ["talents", "skills", "knowledges"] as [
        string,
        string,
        string,
      ],
      abilities: {
        Alertness: 3,
        Athletics: 3,
        Brawl: 4, // freebie-raised
        Empathy: 2,
        "Primal-Urge": 2,
        Melee: 3,
        Drive: 2,
        Etiquette: 2,
        Firearms: 2,
        Academics: 2,
        Computer: 2,
        Enigmas: 1,
      },
    };
    const b = validateStep(char, 4);
    assertEquals(b.complete, true, b.issues.join("; "));
  });

  it("passes Expression specialty below 4 dots (override)", () => {
    const char = {
      ...abilChar(),
      abilityPriority: ["talents", "skills", "knowledges"] as [string, string, string],
      abilities: { Alertness: 3, Athletics: 3, Brawl: 3, Dodge: 2, Empathy: 2,
        Melee: 3, Drive: 2, Etiquette: 2, Firearms: 2, Academics: 2,
        Perception: 1, Occult: 2, Enigmas: 1 },
      abilitySpecialties: { Expression: "Oratory" },
    };
    // Expression is 0 dots -- override allows specialty
    const b = validateStep(char, 4);
    // Specialty check should not add issue for Expression
    const specialtyIssues = b.issues.filter((i) => i.includes("Expression"));
    assertEquals(specialtyIssues.length, 0);
  });
});

describe("validateStep 5 -- Advantages", () => {
  function advChar(): IWoDChar {
    return {
      ...baseChar(),
      breed: "homid", auspice: "ahroun", tribe: "fianna",
      fullName: "Test Character", concept: "Test", age: "25", nature: "Survivor", demeanor: "Loner",
      chargenStep: 5,
      attributePriority: ["physical", "social", "mental"] as [string, string, string],
      attributes: { Strength: 3, Dexterity: 2, Stamina: 2, Charisma: 2, Manipulation: 2, Appearance: 1, Perception: 1, Intelligence: 1, Wits: 1 },
      abilityPriority: ["talents", "skills", "knowledges"] as [string, string, string],
      abilities: { Brawl: 3, Athletics: 3, Alertness: 3, Dodge: 2, Empathy: 2, Melee: 3, Drive: 2, Etiquette: 2, Firearms: 2, Academics: 2, Computer: 2, Enigmas: 1 },
    };
  }

  it("fails when background total is not 5", () => {
    const char = { ...advChar(), backgrounds: { Allies: 2 } }; // only 2 of 5
    const b = validateStep(char, 5);
    assertStringIncludes(b.issues.join(" "), "3 more background dot");
  });

  it("fails Silver Fangs without Pure Breed >= 3", () => {
    const char = {
      ...advChar(),
      tribe: "silver-fangs",
      backgrounds: { "Pure Breed": 2, Allies: 3 }, // Pure Breed only 2
      gifts: ["Apecraft's Blessings", "Falling Touch", "Eye of the Falcon"],
      renown: { glory: 2, honor: 1, wisdom: 0 },
    };
    const b = validateStep(char, 5);
    assertStringIncludes(b.issues.join(" "), "Pure Breed");
  });

  it("passes Silver Fangs with Pure Breed = 3", () => {
    const char = {
      ...advChar(),
      tribe: "silver-fangs",
      backgrounds: { "Pure Breed": 3, Allies: 2 },
      gifts: ["Apecraft's Blessings", "Falling Touch", "Eye of the Falcon"],
      renown: { glory: 2, honor: 1, wisdom: 0 },
    };
    const b = validateStep(char, 5);
    assertEquals(b.complete, true);
  });

  it("fails with wrong gift in pool", () => {
    const char = {
      ...advChar(),
      backgrounds: { Allies: 3, Kinfolk: 2 },
      // gifts[0] = valid homid breed gift; gifts[1] = Ragabash gift (not valid for Ahroun auspice)
      gifts: ["Apecraft's Blessings", "Blur of the Milky Eye", "Inspiration"],
      renown: { glory: 2, honor: 1, wisdom: 0 },
    };
    const b = validateStep(char, 5);
    assertStringIncludes(b.issues.join(" "), "auspice gift");
  });

  it("fails Theurge with wrong renown", () => {
    const char = {
      ...advChar(),
      auspice: "theurge",
      backgrounds: { Allies: 3, Kinfolk: 2 },
      gifts: ["Apecraft's Blessings", "Mother's Touch", "Faerie Light"],
      renown: { glory: 0, honor: 0, wisdom: 2 }, // should be 3 Wisdom
    };
    const b = validateStep(char, 5);
    assertStringIncludes(b.issues.join(" "), "Wisdom");
  });
});

describe("freebiesCost", () => {
  const splat = SplatRegistry.get("wta")!;

  it("charges 5 per attribute dot", () => assertEquals(freebiesCost(splat, "attributes.Strength", 1), 5));
  it("charges 2 per ability dot",   () => assertEquals(freebiesCost(splat, "abilities.Melee", 1), 2));
  it("charges 1 per background dot",() => assertEquals(freebiesCost(splat, "backgrounds.Allies", 1), 1));
  it("charges 7 per gift",          () => assertEquals(freebiesCost(splat, "gifts.breed", 1), 7));
  it("charges 1 per rage dot",      () => assertEquals(freebiesCost(splat, "rage", 1), 1));
  it("charges 2 per gnosis dot",    () => assertEquals(freebiesCost(splat, "gnosis", 1), 2));
  it("charges 1 per willpower dot", () => assertEquals(freebiesCost(splat, "willpower", 1), 1));
});
