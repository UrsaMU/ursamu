// tests/comboGifts.test.ts -- combo gift pure-logic tests (data integrity,
// eligibility, learn/forget, restriction enforcement).
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import {
  activateCombo,
  canLearnCombo,
  comboXpCost,
  eligibleCombos,
  forgetCombo,
  getComboGift,
  knowsCombo,
  learnCombo,
} from "../core/comboGifts.ts";
import {
  COMBO_GIFT_COUNT,
  WTA_COMBO_GIFTS,
} from "../splats/wta/data/comboGifts.ts";
import { WTA_GIFTS } from "../splats/wta/data/gifts.ts";
import { lookupGift } from "../core/giftAction.ts";
import type { IWoDChar } from "../core/types.ts";

function mkChar(over: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "c", playerId: "p", splat: "wta", status: "approved", chargenStep: 6,
    concept: "",
    attributePriority: ["", "", ""] as [string, string, string],
    attributes: {
      Strength: 3, Dexterity: 3, Stamina: 3,
      Charisma: 3, Manipulation: 3, Appearance: 3,
      Perception: 3, Intelligence: 3, Wits: 3,
    },
    attributeSpecialties: {},
    abilityPriority: ["", "", ""] as [string, string, string],
    abilities: {
      Empathy: 3, Subterfuge: 3, Athletics: 3, Brawl: 3,
      Intimidation: 3, Meditation: 3, Occult: 3, Technology: 3,
    },
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 6, willpowerCurrent: 6,
    rage: 5, rageCurrent: 5,
    gnosis: 6, gnosisCurrent: 6,
    freebiesRemaining: 0, freebiesLog: [],
    xpTotal: 100, xpSpent: 0, notes: [], staffNotes: "",
    statLog: [], createdAt: 0, updatedAt: 0,
    breed: "homid",
    auspice: "philodox",
    tribe: "bone-gnawers",
    gifts: [],
    ...over,
  };
}

describe("comboGifts data integrity", () => {
  it("seeds at least 8 combo gifts", () => {
    assert(COMBO_GIFT_COUNT >= 8, `count=${COMBO_GIFT_COUNT}`);
  });
  it("every combo prereq points at a real WTA_GIFTS entry", () => {
    for (const def of Object.values(WTA_COMBO_GIFTS)) {
      for (const p of def.prereqs) {
        const hit = lookupGift(p);
        assert(hit, `${def.slug}: prereq ${p} not found in WTA_GIFTS`);
      }
      assert(def.prereqs.length >= 2, `${def.slug}: needs >=2 prereqs`);
      assert(def.action.description.length > 0, `${def.slug}: no description`);
      assert(def.slug === def.slug.toLowerCase(), `${def.slug}: slug case`);
      assertEquals(def.slug, def.slug.trim());
    }
  });
  it("WTA_GIFTS contains 'cooking' and 'persuasion' (sanity)", () => {
    assert(WTA_GIFTS["cooking"]);
    assert(WTA_GIFTS["persuasion"]);
  });
  it("getComboGift accepts canonical and space-form slugs", () => {
    const a = getComboGift("cooking-the-books");
    assert(a);
    assertEquals(a!.name, "Cooking the Books");
    const b = getComboGift("Cooking the Books");
    assert(b);
    assertEquals(b!.slug, "cooking-the-books");
    assertEquals(getComboGift("does-not-exist"), undefined);
  });
});

describe("comboGifts eligibility", () => {
  it("eligibleCombos returns empty when no prereqs are known", () => {
    const char = mkChar({ gifts: [] });
    const list = eligibleCombos(char);
    assertEquals(list.length, 0);
  });
  it("eligibleCombos includes combos whose prereqs ARE all known", () => {
    const char = mkChar({
      tribe: "bone-gnawers",
      gifts: ["Cooking", "Persuasion"], // canonical names
    });
    const list = eligibleCombos(char);
    assert(list.some((d) => d.slug === "cooking-the-books"));
  });
  it("eligibleCombos excludes combos when only some prereqs known", () => {
    const char = mkChar({ gifts: ["Cooking"], tribe: "bone-gnawers" });
    const list = eligibleCombos(char);
    assertFalse(list.some((d) => d.slug === "cooking-the-books"));
  });
  it("eligibleCombos respects restrictions (wrong tribe excluded)", () => {
    const char = mkChar({
      tribe: "silver-fangs",
      gifts: ["Cooking", "Persuasion"],
    });
    const list = eligibleCombos(char);
    assertFalse(list.some((d) => d.slug === "cooking-the-books"));
  });
  it("eligibleCombos omits combos already learned", () => {
    const char = mkChar({
      tribe: "bone-gnawers",
      gifts: ["Cooking", "Persuasion"],
      comboGifts: ["cooking-the-books"],
    });
    const list = eligibleCombos(char);
    assertFalse(list.some((d) => d.slug === "cooking-the-books"));
  });
});

describe("comboGifts learn/forget round trip", () => {
  it("learnCombo requires all prereqs", () => {
    const char = mkChar({ gifts: ["Cooking"], tribe: "bone-gnawers" });
    const r = learnCombo(char, "cooking-the-books");
    assertFalse(r.ok);
    assert(/prereq/i.test(r.message));
  });
  it("learnCombo enforces restrictions", () => {
    const char = mkChar({
      tribe: "silver-fangs",
      gifts: ["Cooking", "Persuasion"],
    });
    const r = learnCombo(char, "cooking-the-books");
    assertFalse(r.ok);
    assert(/restricted/i.test(r.message));
  });
  it("learnCombo succeeds when prereqs + restrictions match", () => {
    const char = mkChar({
      tribe: "bone-gnawers",
      gifts: ["Cooking", "Persuasion"],
    });
    const r = learnCombo(char, "cooking-the-books");
    assert(r.ok);
    assert(knowsCombo(char, "cooking-the-books"));
    assertEquals(char.comboGifts, ["cooking-the-books"]);
  });
  it("learnCombo rejects duplicates", () => {
    const char = mkChar({
      tribe: "bone-gnawers",
      gifts: ["Cooking", "Persuasion"],
      comboGifts: ["cooking-the-books"],
    });
    const r = learnCombo(char, "cooking-the-books");
    assertFalse(r.ok);
  });
  it("forgetCombo removes the combo and round-trips", () => {
    const char = mkChar({
      tribe: "bone-gnawers",
      gifts: ["Cooking", "Persuasion"],
    });
    learnCombo(char, "cooking-the-books");
    const r = forgetCombo(char, "cooking-the-books");
    assert(r.ok);
    assertFalse(knowsCombo(char, "cooking-the-books"));
    // Forget what you don't know -> error.
    const r2 = forgetCombo(char, "cooking-the-books");
    assertFalse(r2.ok);
  });
});

describe("comboGifts XP + canLearn", () => {
  it("comboXpCost is level * 4", () => {
    for (const def of Object.values(WTA_COMBO_GIFTS)) {
      assertEquals(comboXpCost(def), def.level * 4);
    }
  });
  it("canLearnCombo returns reason on missing prereqs", () => {
    const r = canLearnCombo(mkChar({ tribe: "bone-gnawers" }), "cooking-the-books");
    assertFalse(r.ok);
    assert(r.reason.length > 0);
  });
});

describe("comboGifts activation", () => {
  it("activateCombo refuses unlearned combos", () => {
    const char = mkChar({
      tribe: "bone-gnawers",
      gifts: ["Cooking", "Persuasion"],
    });
    const r = activateCombo(char, "cooking-the-books");
    assertFalse(r.ok);
    assert(/have not learned/i.test(r.message));
  });
  it("activateCombo succeeds on a learned combo with adequate pools", () => {
    const char = mkChar({
      tribe: "bone-gnawers",
      gifts: ["Cooking", "Persuasion"],
      comboGifts: ["cooking-the-books"],
    });
    const r = activateCombo(char, "cooking-the-books");
    assert(r.ok, r.message);
    assertEquals(r.name, "Cooking the Books");
    assert(r.roll);
  });
  it("activateCombo fails-closed on insufficient pool", () => {
    const char = mkChar({
      tribe: "bone-gnawers",
      gifts: ["Cooking", "Persuasion"],
      comboGifts: ["cooking-the-books"],
      gnosis: 0, gnosisCurrent: 0,
    });
    const r = activateCombo(char, "cooking-the-books");
    assertFalse(r.ok);
    assert(/insufficient gnosis/i.test(r.message));
  });
  it("activateCombo rejects empty slug", () => {
    const r = activateCombo(mkChar(), "");
    assertFalse(r.ok);
  });
  it("activateCombo rejects unknown slug", () => {
    const r = activateCombo(mkChar(), "totally-fake-combo");
    assertFalse(r.ok);
  });
});
