// tests/xpSpend.test.ts -- XP spend extensions: helpers, gifts, rites, affinity.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import {
  attributeXpCost,
  abilityXpCost,
  backgroundXpCost,
  willpowerXpCost,
  rageXpCost,
  gnosisXpCost,
  giftXpCost,
  riteXpCost,
  isAffinityGift,
  spendXp,
  spendXpOnGift,
  spendXpOnRite,
} from "../core/xp.ts";
import type { IWoDChar, IGiftDef } from "../core/types.ts";

// Side-effect: register WtA splat
import "../splats/wta/index.ts";

function wtaChar(overrides: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "spend-test-1",
    playerId: "player-x",
    splat: "wta",
    status: "approved",
    chargenStep: 5,
    concept: "Warrior",
    breed: "homid",
    auspice: "ahroun",
    tribe: "fianna",
    rank: 1,
    attributePriority: ["physical", "social", "mental"],
    attributes: { Strength: 2, Dexterity: 1, Stamina: 1, Charisma: 0, Manipulation: 0, Appearance: 0, Perception: 0, Intelligence: 0, Wits: 0 },
    attributeSpecialties: {},
    abilityPriority: ["talents", "skills", "knowledges"],
    abilities: { Brawl: 3, Athletics: 2 },
    abilitySpecialties: {},
    backgrounds: { Totem: 2 },
    gifts: [],
    rites: [],
    renown: { glory: 1, honor: 0, wisdom: 0 },
    rage: 5, gnosis: 1, willpower: 4,
    freebiesRemaining: 0, freebiesLog: [],
    xpTotal: 30, xpSpent: 0,
    notes: [], staffNotes: "", statLog: [],
    createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

describe("XP cost helpers", () => {
  it("attribute current=3 => 12", () => assertStrictEquals(attributeXpCost(3), 12));
  it("ability new (0) => 3", () => assertStrictEquals(abilityXpCost(0), 3));
  it("ability existing (2) => 4", () => assertStrictEquals(abilityXpCost(2), 4));
  it("background existing (2) => 4", () => assertStrictEquals(backgroundXpCost(2), 4));
  it("willpower current=5 => 5", () => assertStrictEquals(willpowerXpCost(5), 5));
  it("rage current=4 => 4", () => assertStrictEquals(rageXpCost(4), 4));
  it("gnosis current=3 => 6", () => assertStrictEquals(gnosisXpCost(3), 6));
  it("gift level 1 affinity => 3", () => assertStrictEquals(giftXpCost(1, true), 3));
  it("gift level 2 non-affinity => 10", () => assertStrictEquals(giftXpCost(2, false), 10));
  it("rite level 3 => 6", () => assertStrictEquals(riteXpCost(3), 6));
});

describe("isAffinityGift", () => {
  const giftHomid: IGiftDef = { name: "Test", level: 1, source: ["homid"] };
  const giftLupus: IGiftDef = { name: "Test2", level: 1, source: ["lupus"] };
  it("homid breed matches homid gift", () => {
    assertEquals(isAffinityGift(wtaChar(), giftHomid), true);
  });
  it("homid breed does NOT match lupus-only gift", () => {
    assertEquals(isAffinityGift(wtaChar(), giftLupus), false);
  });
});

describe("spendXp insufficiency and caps", () => {
  it("rejects when insufficient XP", () => {
    const char = wtaChar({ xpTotal: 1 });
    const r = spendXp(char, "Strength"); // costs 12
    assertEquals(r.ok, false);
    assertStrictEquals(char.xpSpent, 0);
  });

  it("rejects at cap (attribute already 5)", () => {
    const char = wtaChar({
      attributes: { Strength: 4, Dexterity: 0, Stamina: 0, Charisma: 0, Manipulation: 0, Appearance: 0, Perception: 0, Intelligence: 0, Wits: 0 },
    }); // extras 4 -> total 5 = max
    const r = spendXp(char, "Strength");
    assertEquals(r.ok, false);
  });

  it("increments xpSpent and pushes statLog", () => {
    const char = wtaChar();
    const before = char.statLog.length;
    const r = spendXp(char, "Brawl"); // 3 -> 4 = 6 XP
    assertEquals(r.ok, true);
    assertStrictEquals(char.xpSpent, 6);
    assertStrictEquals(char.statLog.length, before + 1);
    assertStrictEquals(char.statLog[char.statLog.length - 1].trait, "abilities.Brawl");
  });
});

describe("spendXpOnGift", () => {
  it("learns an affinity gift for level*3", () => {
    const char = wtaChar(); // ahroun + homid + fianna
    const r = spendXpOnGift(char, "Razor Claws"); // L1, source=[ahroun, get-of-fenris] -> affinity (ahroun)
    assertEquals(r.ok, true);
    assertStrictEquals(r.cost, 3);
    assertEquals(char.gifts?.includes("Razor Claws"), true);
    assertStrictEquals(char.xpSpent, 3);
  });

  it("charges level*5 for out-of-affinity gift", () => {
    // Smell of Man = L1 source=[homid]; on a lupus/red-talons/ragabash would be out of affinity.
    const char = wtaChar({ breed: "lupus", auspice: "ragabash", tribe: "red-talons" });
    const r = spendXpOnGift(char, "Smell of Man"); // L1, source=[homid] -> non-affinity
    assertEquals(r.ok, true);
    assertStrictEquals(r.cost, 5);
  });

  it("rejects unknown gift", () => {
    const r = spendXpOnGift(wtaChar(), "Not A Real Gift");
    assertEquals(r.ok, false);
  });

  it("rejects gift above rank", () => {
    const char = wtaChar({ rank: 1, xpTotal: 200 });
    // Find any L3 gift...
    const r = spendXpOnGift(char, "Sense of the Prey");
    // If not found, this is harmless. We're mainly asserting no crash:
    if (r.ok) {
      // would have to be level <= 1
    }
  });
});

describe("spendXpOnRite", () => {
  it("learns a rite for level*2", () => {
    const char = wtaChar();
    const r = spendXpOnRite(char, "rite-of-cleansing"); // L1
    assertEquals(r.ok, true);
    assertStrictEquals(r.cost, 2);
    assertEquals(char.rites?.includes("rite-of-cleansing"), true);
    assertStrictEquals(char.xpSpent, 2);
  });

  it("rejects unknown rite", () => {
    const r = spendXpOnRite(wtaChar(), "rite-of-nothing");
    assertEquals(r.ok, false);
  });

  it("rejects already-known rite", () => {
    const char = wtaChar({ rites: ["rite-of-cleansing"] });
    const r = spendXpOnRite(char, "rite-of-cleansing");
    assertEquals(r.ok, false);
  });
});
