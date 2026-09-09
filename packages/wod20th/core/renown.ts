// core/renown.ts -- Werewolf Renown award/loss and Rank advancement (W20).
//
// Pure functions only. Callers persist the mutated IWoDChar via saveChar.
// Renown has three tracks (Glory, Honor, Wisdom), each with two values:
//   renown      -- permanent, accumulates at rank-up.
//   renownTemp  -- temporary, current points earned toward next rank.
//
// Advancement is per-auspice and per-track: the combined (perm + temp) for
// each track must meet the auspice's cumulative-permanent requirement for
// the next rank. See core/renownThresholds.ts for the canon chart.

import type { IWoDChar } from "./types.ts";
import {
  highestEligibleRank,
  meetsRank,
  normaliseAuspice,
  RENOWN_THRESHOLDS,
  thresholdFor,
  type AdvanceableRank,
  type Auspice,
  type RenownReq,
} from "./renownThresholds.ts";

export const RANK_NAMES = ["", "Cliath", "Fostern", "Adren", "Athro", "Elder"];

export type RenownTrack = "glory" | "honor" | "wisdom";

export interface RenownResult {
  ok: boolean;
  message: string;
  totalsTemp: RenownReq;
  rankUp?: number;
}

export interface RankRequirement {
  /** Rank being shown (target if rank<5, else 5). */
  rank: number;
  /** Per-track cumulative-permanent requirement, or zeros at rank 5. */
  needed: RenownReq;
  /** Per-track combined (perm + temp) the character currently has. */
  have: RenownReq;
}

// -- Helpers ---------------------------------------------------------------

function ensureRenown(char: IWoDChar): RenownReq {
  if (!char.renown) char.renown = { glory: 0, honor: 0, wisdom: 0 };
  return char.renown;
}

function ensureRenownTemp(char: IWoDChar): RenownReq {
  if (!char.renownTemp) char.renownTemp = { glory: 0, honor: 0, wisdom: 0 };
  return char.renownTemp;
}

function isPositiveInt(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

function combinedPerm(char: IWoDChar): RenownReq {
  const p = ensureRenown(char);
  const t = ensureRenownTemp(char);
  return { glory: p.glory + t.glory, honor: p.honor + t.honor, wisdom: p.wisdom + t.wisdom };
}

// -- Public API ------------------------------------------------------------

/** Award renown of `amount` on `track`. Mutates char.renownTemp. */
export function awardRenown(
  char: IWoDChar,
  track: RenownTrack,
  amount: number,
): RenownResult {
  if (!isPositiveInt(amount)) {
    return {
      ok: false,
      message: "Amount must be a positive integer.",
      totalsTemp: { ...ensureRenownTemp(char) },
    };
  }
  const temp = ensureRenownTemp(char);
  temp[track] += amount;
  return {
    ok: true,
    message: `Awarded ${amount} ${track} renown.`,
    totalsTemp: { ...temp },
  };
}

/** Lose renown of `amount` on `track`. Cannot reduce a temp track below 0. */
export function loseRenown(
  char: IWoDChar,
  track: RenownTrack,
  amount: number,
): RenownResult {
  if (!isPositiveInt(amount)) {
    return {
      ok: false,
      message: "Amount must be a positive integer.",
      totalsTemp: { ...ensureRenownTemp(char) },
    };
  }
  const temp = ensureRenownTemp(char);
  temp[track] = Math.max(0, temp[track] - amount);
  return {
    ok: true,
    message: `Lost ${amount} ${track} renown.`,
    totalsTemp: { ...temp },
  };
}

/** What's needed per-track to reach the next rank. */
export function nextRankRequirement(char: IWoDChar): RankRequirement {
  const rank = char.rank ?? 1;
  const have = combinedPerm(char);
  if (rank >= 5) {
    return { rank: 5, needed: { glory: 0, honor: 0, wisdom: 0 }, have };
  }
  const aus = normaliseAuspice(char.auspice);
  if (!aus) {
    return { rank: rank + 1, needed: { glory: 0, honor: 0, wisdom: 0 }, have };
  }
  return { rank: rank + 1, needed: thresholdFor(aus, (rank + 1) as AdvanceableRank), have };
}

/**
 * If the character meets per-track requirements for the next rank, advance.
 * Folds all temp into permanent, zeroes temp, sets new rank. One rank per
 * call (no double-advance) -- callers may loop if desired.
 *
 * Missing/unknown auspice blocks rank advancement (returns {advanced:false}).
 */
export function maybeAdvanceRank(
  char: IWoDChar,
): { advanced: boolean; newRank?: number; reason?: string } {
  const rawRank = char.rank ?? 1;
  if (!Number.isInteger(rawRank) || rawRank < 1 || rawRank > 5) {
    return { advanced: false };
  }
  const rank = rawRank as 1 | 2 | 3 | 4 | 5;
  if (rank >= 5) return { advanced: false };

  const aus = normaliseAuspice(char.auspice);
  if (!aus) return { advanced: false, reason: "auspice not set" };

  const next = (rank + 1) as AdvanceableRank;
  const req = thresholdFor(aus, next);
  const combined = combinedPerm(char);
  if (!meetsRank(combined, req)) return { advanced: false };

  // Fold all temp into permanent (single-rank step).
  const perm = ensureRenown(char);
  const temp = ensureRenownTemp(char);
  perm.glory  += temp.glory;
  perm.honor  += temp.honor;
  perm.wisdom += temp.wisdom;
  temp.glory = 0;
  temp.honor = 0;
  temp.wisdom = 0;
  char.rank = next;
  return { advanced: true, newRank: next };
}

// Re-exports so callers (commands/renown.ts, tests) can reach the chart.
export {
  RENOWN_THRESHOLDS,
  highestEligibleRank,
  meetsRank,
  normaliseAuspice,
  thresholdFor,
};
export type { AdvanceableRank, Auspice, RenownReq };
