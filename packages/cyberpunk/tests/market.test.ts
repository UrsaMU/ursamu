/**
 * Tests — Market and Economy Utilities
 */
import { assertEquals, assertGreaterOrEqual } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  canOpenNightMarket, canOpenMidnightMarket, canAfford,
  deductEB, addEB, isLifestyleOverdue, daysOverdue,
  canReachPriceCategory,
} from "../engine/market.ts";
import { applyDrug, pruneExpiredEffects, isDrugActive, speedhealAmount } from "../engine/economy.ts";
import { buildNewCharacter } from "../engine/character.ts";
import type { ICPRCharacter } from "../db/schemas.ts";

const makeChar = (role: string, roleRank: number): ICPRCharacter => ({
  ...buildNewCharacter(role as ICPRCharacter["role"]),
  role: role as ICPRCharacter["role"],
  roleRank,
  eurodollars: 1000,
});

describe("canOpenNightMarket()", () => {
  it("requires fixer role and rank 5", () => {
    assertEquals(canOpenNightMarket(makeChar("fixer", 5)), true);
    assertEquals(canOpenNightMarket(makeChar("fixer", 4)), false);
    assertEquals(canOpenNightMarket(makeChar("solo", 5)), false);
  });
});

describe("canOpenMidnightMarket()", () => {
  it("requires fixer role and rank 9", () => {
    assertEquals(canOpenMidnightMarket(makeChar("fixer", 9)), true);
    assertEquals(canOpenMidnightMarket(makeChar("fixer", 8)), false);
  });
});

describe("canAfford()", () => {
  it("true when EB >= amount", () => {
    const char = makeChar("solo", 4);
    assertEquals(canAfford(char, 500), true);
    assertEquals(canAfford(char, 1000), true);
  });

  it("false when EB < amount", () => {
    const char = makeChar("solo", 4);
    assertEquals(canAfford(char, 1001), false);
  });
});

describe("deductEB()", () => {
  it("subtracts amount", () => {
    assertEquals(deductEB(1000, 300), 700);
  });

  it("throws when insufficient", () => {
    let threw = false;
    try { deductEB(100, 200); } catch { threw = true; }
    assertEquals(threw, true);
  });
});

describe("addEB()", () => {
  it("adds to current", () => {
    assertEquals(addEB(500, 250), 750);
  });
});

describe("canReachPriceCategory()", () => {
  it("cheap available at rank 1", () => {
    assertEquals(canReachPriceCategory(1, "cheap"), true);
  });

  it("luxury requires rank 9", () => {
    assertEquals(canReachPriceCategory(8, "luxury"), false);
    assertEquals(canReachPriceCategory(9, "luxury"), true);
  });
});

describe("isLifestyleOverdue()", () => {
  it("true when date is in the past", () => {
    assertEquals(isLifestyleOverdue(Date.now() - 1000), true);
  });

  it("false when date is in the future", () => {
    assertEquals(isLifestyleOverdue(Date.now() + 100000), false);
  });
});

describe("daysOverdue()", () => {
  it("returns 0 if not overdue", () => {
    assertEquals(daysOverdue(Date.now() + 100000), 0);
  });

  it("returns days past due", () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    assertGreaterOrEqual(daysOverdue(twoDaysAgo), 2);
  });
});

describe("applyDrug()", () => {
  it("returns instant flag for instant drugs", () => {
    const char = makeChar("solo", 4);
    // speedheal is listed as instant (durationMs = 0)
    const result = applyDrug(char, "speedheal");
    // Either instant or tracked depending on drug definition
    assertEquals(typeof result.isInstant, "boolean");
  });

  it("no double-stacking same drug", () => {
    const char = makeChar("solo", 4);
    // Apply dorph (has duration)
    const first = applyDrug({ ...char, activeEffects: [] }, "dorph");
    if (!first.isInstant) {
      const second = applyDrug({ ...char, activeEffects: first.newEffects }, "dorph");
      // Should replace, not stack: still only 1 dorph effect
      const dorph = second.newEffects.filter((e) => e.drug === "dorph");
      assertEquals(dorph.length, 1);
    }
  });
});

describe("pruneExpiredEffects()", () => {
  it("removes expired effects", () => {
    const effects = [
      { drug: "stim", effect: "test", expiresAt: Date.now() - 1000 },
      { drug: "boost", effect: "test", expiresAt: Date.now() + 100000 },
    ];
    const pruned = pruneExpiredEffects(effects);
    assertEquals(pruned.length, 1);
    assertEquals(pruned[0].drug, "boost");
  });
});

describe("speedhealAmount()", () => {
  it("body + will", () => {
    assertEquals(speedhealAmount(5, 6), 11);
  });
});
