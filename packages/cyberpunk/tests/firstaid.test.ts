/**
 * Unit tests for +firstaid supporting functions.
 */
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyHealingToChar } from "../engine/character.ts";
import { canSelfStabilize } from "../engine/validation.ts";
import type { ICPRCharacter } from "../db/schemas.ts";

// Minimal ICPRCharacter fixture for healing tests
function makeChar(overrides: Partial<ICPRCharacter> = {}): ICPRCharacter {
  const maxHp = 15;
  const swThreshold = 8;
  return {
    stats: { int: 5, ref: 5, dex: 5, tech: 5, cool: 5, will: 5, luck: 5, move: 5, body: 5, emp: 5, empBase: 5 },
    hp: { max: maxHp, current: 6 },
    swThreshold,
    deathSave: 5,
    deathSavePenalty: 0,
    role: "solo",
    roleRank: 4,
    roleData: {},
    skills: {},
    luckRemaining: 5,
    woundState: "seriously",
    criticalInjuries: [],
    armorBody: null,
    armorHead: null,
    cyberware: [],
    humanityLoss: 0,
    bodysculpt: [],
    activeEffects: [],
    reputation: 0,
    reputationDeeds: [],
    eurodollars: 0,
    lifestyle: null,
    lifepath: {},
    chargenComplete: true,
    chargenStage: "complete",
    chargenMethod: "edgerunner",
    restTimer: null,
    humanityGainedAt: null,
    locationEffects: [],
    gear: [],
    ...overrides,
  };
}

Deno.test("applyHealingToChar restores HP by given amount", () => {
  const char = makeChar({ hp: { max: 15, current: 6 }, woundState: "seriously" });
  const { newHp } = applyHealingToChar(char, 4);
  assertEquals(newHp, 10);
});

Deno.test("applyHealingToChar does not exceed max HP", () => {
  const char = makeChar({ hp: { max: 15, current: 14 }, woundState: "lightly" });
  const { newHp } = applyHealingToChar(char, 6);
  assertEquals(newHp, 15);
});

Deno.test("applyHealingToChar updates wound state to healthy when HP reaches max", () => {
  const char = makeChar({ hp: { max: 15, current: 10 }, woundState: "lightly" });
  const { newHp, newWoundState } = applyHealingToChar(char, 5);
  assertEquals(newHp, 15);
  assertEquals(newWoundState, "healthy");
});

Deno.test("applyHealingToChar updates wound state from seriously to lightly when above swThreshold", () => {
  // swThreshold = 8, healing from 6 to 9 crosses the threshold
  const char = makeChar({ hp: { max: 15, current: 6 }, swThreshold: 8, woundState: "seriously" });
  const { newWoundState } = applyHealingToChar(char, 3);
  assertEquals(newWoundState, "lightly");
});

Deno.test("applyHealingToChar 1d6 range (1–6) always increases HP", () => {
  const char = makeChar({ hp: { max: 15, current: 5 }, woundState: "seriously" });
  for (let heal = 1; heal <= 6; heal++) {
    const { newHp } = applyHealingToChar(char, heal);
    assertNotEquals(newHp, char.hp.current - 1); // never goes down
    assertEquals(newHp, Math.min(15, 5 + heal));
  }
});

Deno.test("canSelfStabilize returns false when IDs are the same", () => {
  assertEquals(canSelfStabilize("player-1", "player-1"), false);
});

Deno.test("canSelfStabilize returns true when IDs differ", () => {
  assertEquals(canSelfStabilize("player-1", "player-2"), true);
});

Deno.test("canSelfStabilize returns false for empty strings", () => {
  assertEquals(canSelfStabilize("", ""), false);
  assertEquals(canSelfStabilize("player-1", ""), false);
  assertEquals(canSelfStabilize("", "player-1"), false);
});
