// tests/xp.test.ts -- Unit tests for XP cost calculation and spend logic.
import { assertEquals, assertStrictEquals, assertThrows } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import { xpCost, spendXp, awardXp } from "../core/xp.ts";
import type { IWoDChar } from "../core/types.ts";

// Load WtA splat registration (side effect)
import "../splats/wta/index.ts";

// -- Minimal character factory ----------------------------------------------

function wtaChar(overrides: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "test-xp-1",
    playerId: "player-1",
    splat: "wta",
    status: "approved",
    chargenStep: 5,
    concept: "Warrior",
    breed: "homid",
    auspice: "ahroun",
    tribe: "fianna",
    attributePriority: ["physical", "social", "mental"],
    attributes: { Strength: 2, Dexterity: 1, Stamina: 2, Charisma: 1, Manipulation: 0, Appearance: 0, Perception: 0, Intelligence: 0, Wits: 0 },
    attributeSpecialties: {},
    abilityPriority: ["talents", "skills", "knowledges"],
    abilities: { Brawl: 3, Athletics: 2, Melee: 1 },
    abilitySpecialties: {},
    backgrounds: { Totem: 3 },
    gifts: ["Apecraft's Blessings", "Inspiration", "Razor Claws"],
    renown: { glory: 2, honor: 1, wisdom: 0 },
    rage: 5,
    gnosis: 1,
    willpower: 4,
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 30,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// -- xpCost -----------------------------------------------------------------

describe("xpCost", () => {
  it("attribute: current rating × 4 (base 1 + extras)", () => {
    const char = wtaChar();
    // Strength has 2 extras -> total 3 -> cost = 3 × 4 = 12
    assertStrictEquals(xpCost(char, "attributes.Strength"), 12);
  });

  it("attribute at base (1 extra = total 2): cost = 2 × 4 = 8", () => {
    const char = wtaChar();
    // Dexterity has 1 extra -> total 2 -> cost = 2 × 4 = 8
    assertStrictEquals(xpCost(char, "attributes.Dexterity"), 8);
  });

  it("new ability (0 dots): costs 3 XP", () => {
    const char = wtaChar();
    assertStrictEquals(xpCost(char, "abilities.Dodge"), 3);
  });

  it("existing ability (3 dots): costs 3 × 2 = 6 XP", () => {
    const char = wtaChar();
    assertStrictEquals(xpCost(char, "abilities.Brawl"), 6);
  });

  it("existing ability (1 dot): costs 1 × 2 = 2 XP", () => {
    const char = wtaChar();
    assertStrictEquals(xpCost(char, "abilities.Melee"), 2);
  });

  it("willpower: current × 1", () => {
    const char = wtaChar(); // willpower = 4
    assertStrictEquals(xpCost(char, "willpower"), 4);
  });

  it("rage: current × 1", () => {
    const char = wtaChar(); // rage = 5
    assertStrictEquals(xpCost(char, "rage"), 5);
  });

  it("gnosis: current × 2", () => {
    const char = wtaChar(); // gnosis = 1
    assertStrictEquals(xpCost(char, "gnosis"), 2);
  });

  it("background: new = 2, existing = current × 2", () => {
    const char = wtaChar(); // Totem = 3
    assertStrictEquals(xpCost(char, "backgrounds.Totem"), 6);
    assertStrictEquals(xpCost(char, "backgrounds.Resources"), 2); // new
  });

  it("renown returns 0 (earned through play)", () => {
    const char = wtaChar();
    assertStrictEquals(xpCost(char, "renown.glory"), 0);
  });
});

// -- spendXp ----------------------------------------------------------------

describe("spendXp", () => {
  it("raises an ability by 1 and deducts XP", () => {
    const char = wtaChar(); // Brawl = 3, cost = 6
    const result = spendXp(char, "Brawl");
    assertEquals(result.ok, true);
    assertStrictEquals(char.abilities["Brawl"], 4);
    assertStrictEquals(char.xpSpent, 6);
    assertStrictEquals(result.cost, 6);
  });

  it("raises an attribute by 1 (tracks extras)", () => {
    const char = wtaChar(); // Strength extras = 2, total = 3, cost = 3×4 = 12
    const result = spendXp(char, "Strength");
    assertEquals(result.ok, true);
    assertStrictEquals(char.attributes["Strength"], 3); // extras 2->3
    assertStrictEquals(char.xpSpent, 12);
  });

  it("fails when not enough XP", () => {
    const char = wtaChar({ xpTotal: 5 }); // Strength costs 12
    const result = spendXp(char, "Strength");
    assertEquals(result.ok, false);
  });

  it("fails on non-approved characters", () => {
    const char = wtaChar({ status: "submitted" });
    const result = spendXp(char, "Brawl");
    assertEquals(result.ok, false);
  });

  it("fails on renown", () => {
    const char = wtaChar();
    const result = spendXp(char, "renown.glory");
    assertEquals(result.ok, false);
  });

  it("produces an IXpEntry with correct fields", () => {
    const char = wtaChar();
    const result = spendXp(char, "Melee"); // Melee = 1, cost = 2
    assertEquals(result.ok, true);
    assertStrictEquals(result.entry?.type, "spend");
    assertStrictEquals(result.entry?.amount, -2);
    assertStrictEquals(result.entry?.oldValue, 1);
    assertStrictEquals(result.entry?.newValue, 2);
    assertStrictEquals(result.entry?.trait, "abilities.Melee");
  });

  it("fails when trait is at max", () => {
    const char = wtaChar({ attributes: { Strength: 4, Dexterity: 0, Stamina: 0, Charisma: 0, Manipulation: 0, Appearance: 0, Perception: 0, Intelligence: 0, Wits: 0 } });
    const result = spendXp(char, "Strength"); // extras=4 -> total=5 = max
    assertEquals(result.ok, false);
  });
});

// -- awardXp ----------------------------------------------------------------

describe("awardXp", () => {
  it("increases xpTotal and returns an entry", () => {
    const char = wtaChar({ xpTotal: 10 });
    const entry = awardXp(char, 5, "Scene award", "staff-1");
    assertStrictEquals(char.xpTotal, 15);
    assertStrictEquals(entry.type, "award");
    assertStrictEquals(entry.amount, 5);
    assertStrictEquals(entry.reason, "Scene award");
    assertStrictEquals(entry.staffId, "staff-1");
  });

  // -- Security exploit tests (must fail before patch, pass after) ----------

  // C-1: self-award
  it("EXPLOIT C-1: staff cannot award XP to their own character", () => {
    const char = wtaChar({ playerId: "staff-self" });
    assertThrows(
      () => awardXp(char, 10, "self award", "staff-self"),
      Error,
      "Cannot award XP to yourself",
    );
  });

  // H-1: unbounded award
  it("EXPLOIT H-1: award amount is capped at reasonable maximum", () => {
    const char = wtaChar();
    assertThrows(
      () => awardXp(char, 10_000, "infinite XP", "staff-1"),
      Error,
      "exceeds maximum",
    );
  });

  // H-1: XP set total too large
  it("EXPLOIT H-1b: awardXp rejects non-positive amount", () => {
    const char = wtaChar();
    assertThrows(() => awardXp(char, 0, "zero", "staff-1"), Error);
    assertThrows(() => awardXp(char, -5, "negative", "staff-1"), Error);
  });

  // M-1: zero-cost spend
  it("EXPLOIT M-1: spendXp rejects when xpCost returns 0", () => {
    const char = wtaChar();
    // renown cannot be raised -- xpCost returns 0
    const result = spendXp(char, "renown.glory");
    assertEquals(result.ok, false);
    // Verify xpSpent was NOT modified
    assertStrictEquals(char.xpSpent, 0);
  });
});

// -- Merit security tests ---------------------------------------------------

import { applySet } from "../core/chargen.ts";

describe("merit/flaw exploit tests", () => {
  function step4Char(): IWoDChar {
    return {
      id: "merit-test",
      playerId: "player-1",
      splat: "wta",
      status: "draft",
      chargenStep: 5,
      concept: "Warrior",
      breed: "homid",
      auspice: "ahroun",
      tribe: "fianna",
      attributePriority: ["physical", "social", "mental"],
      attributes: { Strength: 3, Dexterity: 2, Stamina: 2, Charisma: 1, Manipulation: 1, Appearance: 0, Perception: 1, Intelligence: 0, Wits: 0 },
      attributeSpecialties: {},
      abilityPriority: ["talents", "skills", "knowledges"],
      abilities: { Brawl: 3, Athletics: 3, Alertness: 3, Subterfuge: 2, Empathy: 2, Melee: 3, Drive: 2, Etiquette: 2, Firearms: 2, Academics: 2, Computer: 2, Enigmas: 1 },
      abilitySpecialties: {},
      backgrounds: { Totem: 3, Resources: 2 },
      gifts: ["Apecraft's Blessings", "Inspiration", "Razor Claws"],
      renown: { glory: 2, honor: 1, wisdom: 0 },
      rage: 5,
      gnosis: 1,
      willpower: 4,
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

  // H-2: flaw cap enforced
  it("EXPLOIT H-2: cannot exceed 7pt flaw cap", () => {
    const char = step4Char();
    // Take 6pt of flaws first (e.g. Blind=6)
    applySet(char, "flaw", "Blind");
    assertStrictEquals(char.freebiesRemaining, 21); // 15 + 6
    // Now try to add a 2pt flaw -- would push total to 8
    const result = applySet(char, "flaw", "One Eye");
    assertEquals(result.ok, false, "EXPLOIT: accepted flaws beyond 7pt cap");
    // freebies must not have increased further
    assertStrictEquals(char.freebiesRemaining, 21);
  });

  // H-2: toggle-based flaw double-refund
  it("EXPLOIT H-2b: removing a flaw that was never added does not give freebies", () => {
    const char = step4Char();
    // Toggling a flaw that is NOT present -- should ADD it (not remove/refund)
    const result = applySet(char, "flaw", "Short");
    assertEquals(result.ok, true);
    assertStrictEquals(char.freebiesRemaining, 16); // +1 bonus
    // Second toggle removes it
    const result2 = applySet(char, "flaw", "Short");
    assertEquals(result2.ok, true);
    assertStrictEquals(char.freebiesRemaining, 15); // bonus deducted back
    // Third toggle adds again -- NOT a double-refund
    applySet(char, "flaw", "Short");
    assertStrictEquals(char.freebiesRemaining, 16);
  });
});
