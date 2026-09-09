// core/wounds.ts -- M20 wound penalty calculation (pure, no IO).
//
// Health track damage imposes a dice pool penalty based on the worst-filled
// health level. The "worst filled" level is the highest index that has a
// non-empty damage mark anywhere in the track (gaps are tolerated).
//
// Bruised(0): -0  Hurt(1): -1  Injured(2): -1
// Wounded(3): -2  Mauled(4): -2  Crippled(5): -5  Incap(6): no action.
//
// The penalty is applied in the command layer (see commands/roll.ts and
// friends); core/dice.ts stays pure math.
import type { IWoDChar } from "./types.ts";
import { HEALTH_TRACK_SIZE } from "./health.ts";

/** Penalty deducted from the dice pool, indexed by health level 0..5. */
export const WOUND_PENALTIES = [0, 1, 1, 2, 2, 5] as const;

/** Index of the Incapacitated slot in the health track. */
export const INCAP_INDEX = 6;

/**
 * Compute the dice-pool penalty for `char`.
 *
 * Walks the health track from end to start, finds the highest-indexed
 * non-empty slot, and returns the penalty for that level. Returns 0 when
 * the track is missing, undefined, or fully empty. Slot 6 (Incapacitated)
 * has no listed penalty; callers should gate on {@link isIncapacitated}
 * instead -- this function clamps the index to the WOUND_PENALTIES range
 * so a filled Incap slot reports the Crippled penalty (5).
 */
export function woundPenalty(char: IWoDChar): number {
  // Resist Pain (Philodox L2) and similar gifts set ignoreWoundsUntil
  // to an epoch ms while the bypass is active. Honored here so every
  // call site -- combat, defense, rolls, stepside, etc. -- benefits.
  if (typeof char.ignoreWoundsUntil === "number"
      && char.ignoreWoundsUntil > Date.now()) {
    return 0;
  }
  const track = char.healthTrack;
  if (!track || track.length === 0) return 0;
  for (let i = track.length - 1; i >= 0; i--) {
    if (track[i] && track[i] !== "") {
      const idx = Math.min(i, WOUND_PENALTIES.length - 1);
      return WOUND_PENALTIES[idx];
    }
  }
  return 0;
}

/**
 * True when the character's Incapacitated slot is filled.
 * Uses HEALTH_TRACK_SIZE-1 rather than INCAP_INDEX directly so a track
 * shorter than the canonical size still answers reasonably (last slot).
 */
export function isIncapacitated(char: IWoDChar): boolean {
  const track = char.healthTrack;
  if (!track || track.length === 0) return false;
  const last = Math.min(HEALTH_TRACK_SIZE - 1, track.length - 1);
  return track[last] !== "" && track[last] !== undefined;
}

/**
 * Apply the wound penalty to `pool`, floored at 0. Also reports the raw
 * penalty deducted and whether the character is incapacitated so the
 * caller can short-circuit roll attempts.
 */
export function appliedPool(
  char: IWoDChar,
  pool: number,
): { pool: number; penalty: number; incap: boolean } {
  const penalty = woundPenalty(char);
  const incap   = isIncapacitated(char);
  const reduced = Math.max(0, pool - penalty);
  return { pool: reduced, penalty, incap };
}
