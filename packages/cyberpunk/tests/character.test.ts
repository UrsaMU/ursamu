/**
 * Tests — Character Calculation Utilities
 */
import { assertEquals, assertGreaterOrEqual } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  calcMaxHP, calcSWThreshold, calcCurrentEMP, deriveWoundState,
  woundActionPenalty, woundMovePenalty, totalDeathSavePenalty,
  applyDamageToChar, applyHealingToChar, buildNewCharacter, recalcDerived,
  CHARGEN_POINTS, CHARGEN_STAT_MAX, CHARGEN_STAT_MIN,
} from "../engine/character.ts";
import type { ICPRCharacter } from "../db/schemas.ts";

describe("calcMaxHP()", () => {
  it("10 + ceil((body+will)/2)", () => {
    assertEquals(calcMaxHP(5, 5), 15);
    assertEquals(calcMaxHP(8, 6), 17);
    assertEquals(calcMaxHP(3, 3), 13);
  });

  it("handles odd totals with ceiling", () => {
    assertEquals(calcMaxHP(5, 4), 15); // (5+4)/2 = 4.5 → ceil = 5 → 10+5 = 15
  });
});

describe("calcSWThreshold()", () => {
  it("ceil(maxHP/2)", () => {
    assertEquals(calcSWThreshold(15), 8);
    assertEquals(calcSWThreshold(20), 10);
    assertEquals(calcSWThreshold(13), 7);
  });
});

describe("calcCurrentEMP()", () => {
  it("empBase - floor(HL/10)", () => {
    assertEquals(calcCurrentEMP(6, 0), 6);
    assertEquals(calcCurrentEMP(6, 10), 5);
    assertEquals(calcCurrentEMP(6, 25), 4); // floor(25/10) = 2
  });
});

describe("deriveWoundState()", () => {
  it("healthy at or above max", () => {
    assertEquals(deriveWoundState(15, 15, 8), "healthy");
  });

  it("lightly wounded between sw and max", () => {
    assertEquals(deriveWoundState(12, 15, 8), "lightly");
  });

  it("seriously wounded below sw threshold", () => {
    assertEquals(deriveWoundState(5, 15, 8), "seriously");
  });

  it("mortally wounded at 0", () => {
    assertEquals(deriveWoundState(0, 15, 8), "mortally");
  });
});

describe("woundActionPenalty()", () => {
  it("0 for healthy/lightly", () => {
    assertEquals(woundActionPenalty("healthy"), 0);
    assertEquals(woundActionPenalty("lightly"), 0);
  });

  it("-2 for seriously wounded", () => {
    assertEquals(woundActionPenalty("seriously"), -2);
  });

  it("-4 for mortally wounded", () => {
    assertEquals(woundActionPenalty("mortally"), -4);
  });
});

describe("woundMovePenalty()", () => {
  it("0 for healthy/lightly", () => {
    assertEquals(woundMovePenalty("healthy"), 0);
    assertEquals(woundMovePenalty("lightly"), 0);
  });

  it("-6 for seriously and mortally", () => {
    assertEquals(woundMovePenalty("seriously"), -6);
    assertEquals(woundMovePenalty("mortally"), -6);
  });
});

describe("applyDamageToChar()", () => {
  const baseChar = buildNewCharacter("solo");

  it("reduces HP", () => {
    const { newHp } = applyDamageToChar(baseChar, 5);
    assertEquals(newHp, baseChar.hp.max - 5);
  });

  it("transitions wound state on serious damage", () => {
    const bigDmg = baseChar.hp.max;
    const { newWoundState } = applyDamageToChar(baseChar, bigDmg);
    assertEquals(newWoundState, "mortally");
  });

  it("does not mutate original character", () => {
    const original = baseChar.hp.current;
    applyDamageToChar(baseChar, 5);
    assertEquals(baseChar.hp.current, original);
  });
});

describe("applyHealingToChar()", () => {
  it("restores HP up to max", () => {
    const char = { ...buildNewCharacter("solo"), hp: { max: 15, current: 5 } };
    const { newHp } = applyHealingToChar(char, 20);
    assertEquals(newHp, 15);
  });

  it("transitions wound state on heal", () => {
    const char = { ...buildNewCharacter("solo"), hp: { max: 15, current: 1 }, woundState: "seriously" as const };
    const { newWoundState } = applyHealingToChar(char, 14);
    assertEquals(newWoundState, "healthy");
  });
});

describe("buildNewCharacter()", () => {
  it("builds a valid character", () => {
    const char = buildNewCharacter("fixer");
    assertEquals(char.role, "fixer");
    assertEquals(char.chargenComplete, false);
    assertEquals(char.chargenStage, "method");
    assertGreaterOrEqual(char.hp.max, 10);
  });

  it("starts with basic skills at level 2", () => {
    const char = buildNewCharacter("solo");
    // perception is a basic skill
    assertGreaterOrEqual(char.skills["perception"] ?? 0, 2);
  });
});

describe("recalcDerived()", () => {
  it("updates HP when BODY changes", () => {
    const char = buildNewCharacter("solo");
    const updated = recalcDerived({ ...char, stats: { ...char.stats, body: 8, will: 5 } });
    assertEquals(updated.hp.max, calcMaxHP(8, 5));
  });

  it("updates EMP when humanityLoss changes", () => {
    const char = buildNewCharacter("solo");
    const updated = recalcDerived({ ...char, humanityLoss: 20 });
    assertEquals(updated.stats.emp, calcCurrentEMP(char.stats.empBase, 20));
  });
});

describe("CHARGEN constants", () => {
  it("CHARGEN_POINTS is 62", () => {
    assertEquals(CHARGEN_POINTS, 62);
  });

  it("CHARGEN_STAT_MAX is 8", () => {
    assertEquals(CHARGEN_STAT_MAX, 8);
  });

  it("CHARGEN_STAT_MIN is 2", () => {
    assertEquals(CHARGEN_STAT_MIN, 2);
  });
});
