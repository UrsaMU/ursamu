import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  applyDamage,
  healDamage,
  healthMax,
  totalDamage,
  woundPenalty,
} from "../src/health/index.ts";
import { defaultSheet, setTrait } from "../src/stats/index.ts";
import { parseRollExpression } from "../src/roller/index.ts";
import type { HealthTrack } from "../src/stats/sheet.ts";

const emptyTrack = (): HealthTrack => ({ bashing: 0, lethal: 0, aggravated: 0 });

describe("CoFD Health math", () => {
  it("healthMax returns stamina + size for a default sheet (1 + 5 = 6)", () => {
    const sheet = defaultSheet();
    assertEquals(healthMax(sheet), 6);
  });

  it("applyDamage adds bashing to empty track at left positions", () => {
    const t = applyDamage(emptyTrack(), 3, "bashing", 6);
    assertEquals(t.bashing, 3);
    assertEquals(t.lethal, 0);
    assertEquals(t.aggravated, 0);
    assertEquals(totalDamage(t), 3);
  });

  it("lethal damage into a full bashing track upgrades leftmost bashing to lethal", () => {
    let t: HealthTrack = { bashing: 6, lethal: 0, aggravated: 0 };
    t = applyDamage(t, 1, "lethal", 6);
    // Total still 6, but one box went from bashing -> lethal.
    assertEquals(totalDamage(t), 6);
    assertEquals(t.bashing, 5);
    assertEquals(t.lethal, 1);
    assertEquals(t.aggravated, 0);
  });

  it("aggravated damage into a full lethal track upgrades leftmost lethal to aggravated", () => {
    let t: HealthTrack = { bashing: 0, lethal: 6, aggravated: 0 };
    t = applyDamage(t, 1, "aggravated", 6);
    assertEquals(totalDamage(t), 6);
    assertEquals(t.lethal, 5);
    assertEquals(t.aggravated, 1);
    assertEquals(t.bashing, 0);
  });

  it("healDamage('any', 2) removes the heaviest type first", () => {
    const t: HealthTrack = { bashing: 2, lethal: 2, aggravated: 1 };
    // Heal 2 of "any": should remove 1 aggravated, then 1 lethal.
    const out = healDamage(t, 2, "any");
    assertEquals(out.aggravated, 0);
    assertEquals(out.lethal, 1);
    assertEquals(out.bashing, 2);
  });

  it("woundPenalty: 0 for empty; -1, -2, -3 by position; worst applicable wins", () => {
    const max = 6;
    // 0 damage -> 0
    assertEquals(woundPenalty(emptyTrack(), max), 0);
    // 3 boxes free -> only 3rd-to-last would matter when damaged; here filled = 3 (max-3) => 0
    assertEquals(woundPenalty({ bashing: 3, lethal: 0, aggravated: 0 }, max), 0);
    // 4 filled — 3rd-to-last box (index 3, the box at max-2) is now damaged: -1
    assertEquals(woundPenalty({ bashing: 4, lethal: 0, aggravated: 0 }, max), -1);
    // 5 filled — 2nd-to-last box damaged: -2
    assertEquals(woundPenalty({ bashing: 5, lethal: 0, aggravated: 0 }, max), -2);
    // 6 filled (full track) — last box damaged: -3
    assertEquals(woundPenalty({ bashing: 6, lethal: 0, aggravated: 0 }, max), -3);
    // Mixed-type fills also count for penalty purposes (any damage triggers).
    assertEquals(woundPenalty({ bashing: 2, lethal: 2, aggravated: 1 }, max), -2);
  });

  it("parseRollExpression applies wound penalty term for a sheet with -2 penalty", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "strength", 3);
    sheet = setTrait(sheet, "brawl", 2);
    // Default sheet: stamina=1, size=5, so max=6. 5 filled boxes -> -2 wound penalty.
    sheet.health = { bashing: 5, lethal: 0, aggravated: 0 };

    const result = parseRollExpression("Strength+Brawl", sheet);
    // 3 + 2 - 2 = 3
    assertEquals(result.pool, 3);
    // Wound term should appear in the term list.
    assert(result.terms.some(t => t.includes("Wound")), `Expected Wound term, got: ${JSON.stringify(result.terms)}`);
    assertStringIncludes(result.terms.join(" "), "Wound(-2)");
  });

  it("parseRollExpression does NOT apply wound penalty on raw-pool roll '+roll 6'", () => {
    const sheet = defaultSheet();
    sheet.health = { bashing: 6, lethal: 0, aggravated: 0 }; // full -> would be -3
    const result = parseRollExpression("6", sheet);
    assertEquals(result.pool, 6);
    assertEquals(result.terms[0], "Raw Pool (6)");
    assert(!result.terms.some(t => t.includes("Wound")), "Raw pool must not carry wound penalty");
  });
});
