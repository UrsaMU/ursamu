/**
 * +stim command — unit tests
 *
 * Tests:
 *  1. applyHealingToChar heals exactly 10 HP (the stim amount)
 *  2. Cooldown gate: used within 24h → rejected
 *  3. Cooldown gate: used more than 24h ago → allowed
 */
import { assertEquals } from "jsr:@std/assert@^1";
import { applyHealingToChar } from "../engine/character.ts";
import type { ICPRCharacter } from "../db/schemas.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal ICPRCharacter sufficient for applyHealingToChar. */
function makeChar(current: number, max: number): ICPRCharacter {
  const swThreshold = Math.ceil(max / 2);
  return {
    stats: {
      int: 5, ref: 5, dex: 5, tech: 5, cool: 5,
      will: 5, luck: 5, move: 5, body: 5, emp: 5, empBase: 5,
    },
    hp: { max, current },
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
    chargenMethod: "streetrat",
    restTimer: null,
    humanityGainedAt: null,
    locationEffects: [],
    gear: [],
  } as ICPRCharacter;
}

const STIM_COOLDOWN_MS = 86_400_000;

/** Pure cooldown gate — mirrors the logic in the command. */
function stimOnCooldown(stimLastUsed: number): boolean {
  return Date.now() - stimLastUsed < STIM_COOLDOWN_MS;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

Deno.test("applyHealingToChar: stim heals exactly 10 HP", () => {
  const char = makeChar(20, 40);
  const { newHp, newWoundState } = applyHealingToChar(char, 10);
  assertEquals(newHp, 30);
  assertEquals(newWoundState, "lightly"); // 30 >= swThreshold(20), below max
});

Deno.test("applyHealingToChar: stim does not exceed max HP", () => {
  const char = makeChar(38, 40);
  const { newHp } = applyHealingToChar(char, 10);
  assertEquals(newHp, 40);
});

Deno.test("stim cooldown: used moments ago → on cooldown", () => {
  const justNow = Date.now() - 1_000; // 1 second ago
  assertEquals(stimOnCooldown(justNow), true);
});

Deno.test("stim cooldown: used 23h59m ago → still on cooldown", () => {
  const almostExpired = Date.now() - (STIM_COOLDOWN_MS - 60_000);
  assertEquals(stimOnCooldown(almostExpired), true);
});

Deno.test("stim cooldown: used exactly 24h ago → allowed", () => {
  const exactlyExpired = Date.now() - STIM_COOLDOWN_MS;
  assertEquals(stimOnCooldown(exactlyExpired), false);
});

Deno.test("stim cooldown: never used (stimLastUsed = 0) → allowed", () => {
  assertEquals(stimOnCooldown(0), false);
});
