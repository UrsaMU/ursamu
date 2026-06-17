// Breaking Points / Integrity loss engine -- pure functions over CofdSheet.
//
// Implements the Chronicles of Darkness 2e corebook rule (p.73-74):
//   pool = Resolve + Composure + Integrity-rating modifier + situational modifier
//   roll Resolve+Composure with executeRoll (chance die fallback)
//   dramatic failure -> -1 Integrity, gain Broken/Fugue/Madness, +1 Beat
//   failure          -> -1 Integrity, gain Guilty/Shaken/Spooked
//   success          -> no loss, gain Guilty/Shaken/Spooked (mild)
//   exceptional      -> no loss, gain Steadfast/Inspired, +1 Willpower, +1 Beat
//
// Integrity is stored on CofdSheet.moralityValue. This engine never touches
// other tracks (Humanity, Wisdom, Harmony) -- callers are expected to gate
// on template == "mortal" if the chronicle treats those tracks separately.

import type { CofdSheet } from "../stats/sheet.ts";
import { addCondition, hasCondition } from "../subsystems/conditions.ts";
import { addBeats } from "../xp/beats.ts";
import { executeRoll, type RollResult } from "../roller/execute.ts";

export type BreakOutcome = "dramatic" | "failure" | "success" | "exceptional";

export interface BreakingPointInput {
  /** Current Integrity (moralityValue) dot rating, 0..10. */
  integrity: number;
  /** Resolve attribute, used in the pool. */
  resolve: number;
  /** Composure attribute, used in the pool. */
  composure: number;
  /**
   * Situational modifier per the RAW Breaking Point Modifiers table
   * (capped at +/-5 per the rulebook). The caller decides the value;
   * the engine just adds it to the pool.
   */
  modifier?: number;
}

export interface BreakingPointResult {
  outcome: BreakOutcome;
  pool: number;
  integrityMod: number;
  totalModifier: number;
  roll: RollResult;
  integrityLoss: number;
  /** Condition keys (lowercase-kebab) granted by this breaking point. */
  conditionsGranted: string[];
  willpowerRegained: number;
  beatsAwarded: number;
}

/**
 * RAW Integrity-rating modifier table (corebook p.73):
 *   8-10 -> +2
 *   6-7  -> +1
 *   4-5  ->  0
 *   2-3  -> -1
 *   0-1  -> -2
 */
export function integrityModifier(integrity: number): number {
  if (integrity >= 8) return 2;
  if (integrity >= 6) return 1;
  if (integrity >= 4) return 0;
  if (integrity >= 2) return -1;
  return -2;
}

/** Clamp situational modifier to +/-5 per RAW guidance. */
export function clampSituational(mod: number): number {
  if (mod > 5) return 5;
  if (mod < -5) return -5;
  return mod;
}

/**
 * Pick the first catalog condition key from `candidates` that isn't
 * already active on the sheet. Falls back to the first candidate if the
 * sheet already has all of them (the caller's addCondition is a no-op,
 * preserving idempotency).
 */
function pickCondition(sheet: CofdSheet, candidates: string[]): string {
  for (const key of candidates) {
    if (!hasCondition(sheet, key)) return key;
  }
  return candidates[0];
}

/**
 * Roll a Breaking Point. Pure: no DB calls, no I/O. Returns the full
 * result plus the conditions that *would* be granted -- applyBreakingPoint
 * actually mutates the sheet copy.
 *
 * If `injectRoll` is provided, the engine uses it instead of rolling dice
 * (used by tests to assert each outcome path deterministically).
 */
export function rollBreakingPoint(
  input: BreakingPointInput,
  sheet: CofdSheet,
  injectRoll?: RollResult,
): BreakingPointResult {
  const integrityMod = integrityModifier(input.integrity);
  const situational = clampSituational(input.modifier ?? 0);
  const totalModifier = integrityMod + situational;
  const rawPool = (input.resolve | 0) + (input.composure | 0) + totalModifier;
  const pool = Math.max(0, rawPool);

  const roll = injectRoll ?? executeRoll(pool);

  let outcome: BreakOutcome;
  if (roll.isChanceDie && roll.dramaticFailure) outcome = "dramatic";
  else if (roll.dramaticFailure) outcome = "dramatic";
  else if (roll.exceptional) outcome = "exceptional";
  else if (roll.successes > 0) outcome = "success";
  else outcome = "failure";

  let integrityLoss = 0;
  let conditionsGranted: string[] = [];
  let willpowerRegained = 0;
  let beatsAwarded = 0;

  switch (outcome) {
    case "dramatic":
      integrityLoss = 1;
      conditionsGranted = [pickCondition(sheet, ["madness", "fugue", "broken"])];
      beatsAwarded = 1;
      break;
    case "failure":
      integrityLoss = 1;
      conditionsGranted = [pickCondition(sheet, ["shaken", "guilty"])];
      break;
    case "success":
      conditionsGranted = [pickCondition(sheet, ["guilty", "shaken", "spooked"])];
      break;
    case "exceptional":
      conditionsGranted = [pickCondition(sheet, ["steadfast", "inspired"])];
      willpowerRegained = 1;
      beatsAwarded = 1;
      break;
  }

  return {
    outcome,
    pool: rawPool,
    integrityMod,
    totalModifier,
    roll,
    integrityLoss,
    conditionsGranted,
    willpowerRegained,
    beatsAwarded,
  };
}

/**
 * Apply a BreakingPointResult to a sheet. Returns a new sheet with:
 *   - moralityValue decremented (floor 0) on loss outcomes
 *   - Conditions appended via the conditions subsystem (idempotent)
 *   - willpowerCurrent bumped (capped at willpowerMax) on exceptional
 *   - beats counter advanced on dramatic/exceptional
 */
export function applyBreakingPoint(
  sheet: CofdSheet,
  result: BreakingPointResult,
): CofdSheet {
  let out: CofdSheet = { ...sheet };

  if (result.integrityLoss > 0) {
    out.moralityValue = Math.max(0, (out.moralityValue | 0) - result.integrityLoss);
  }

  for (const key of result.conditionsGranted) {
    out = addCondition(out, key);
  }

  if (result.willpowerRegained > 0) {
    const max = out.advantages?.willpowerMax ?? 0;
    const cur = out.advantages?.willpowerCurrent ?? 0;
    out = {
      ...out,
      advantages: {
        ...out.advantages,
        willpowerCurrent: Math.min(max, cur + result.willpowerRegained),
      },
    };
  }

  if (result.beatsAwarded > 0) {
    out = addBeats(out, result.beatsAwarded, false);
  }

  return out;
}
