// core/dice.ts -- WoD20th d10 dice pool engine.
// Rules: each die >= difficulty = success; 1s cancel one success each;
//        net 0 successes with at least one 1 = botch.
//        Specialty: 10s count as 2 successes.
import type { IWoDChar } from "./types.ts";
import { ALL_ATTRIBUTES, ALL_ABILITIES } from "./attributes.ts";

export const DEFAULT_DIFFICULTY = 6;
export const MAX_POOL = 30;

export interface IDiceRoll {
  pool:         number;
  difficulty:   number;
  dice:         number[];
  rawSuccesses: number;   // dice >= difficulty (10s count 2 with specialty)
  ones:         number;   // dice showing 1
  netSuccesses: number;   // rawSuccesses - ones, clamped >= 0
  botch:        boolean;  // ones > rawSuccesses
  exceptional:  boolean;  // net >= 5
  specialty:    boolean;
}

export interface IPoolResolution {
  pool:      number;
  pubLabel:  string;  // "Strength + Brawl"       -- shown to room
  privLabel: string;  // "Strength(3) + Brawl(3)" -- shown to roller
}

function d10(): number {
  return Math.floor(Math.random() * 10) + 1;
}

/**
 * Evaluate a pre-rolled set of dice.
 * Separating evaluation from random generation makes the logic unit-testable.
 */
export function evaluateRoll(
  dice: number[],
  difficulty: number,
  specialty = false,
): IDiceRoll {
  const diff = Math.max(2, Math.min(difficulty, 10));
  let rawSuccesses = 0;
  let ones = 0;

  for (const d of dice) {
    if (d === 1) {
      ones++;
    } else if (d >= diff) {
      rawSuccesses += (specialty && d === 10) ? 2 : 1;
    }
  }

  const netSuccesses = Math.max(0, rawSuccesses - ones);
  return {
    pool: dice.length,
    difficulty: diff,
    dice,
    rawSuccesses,
    ones,
    netSuccesses,
    botch: netSuccesses === 0 && ones > 0 && ones > rawSuccesses,
    exceptional: netSuccesses >= 5,
    specialty,
  };
}

/** Roll `pool` d10s and evaluate. */
export function rollDice(
  pool: number,
  difficulty = DEFAULT_DIFFICULTY,
  specialty = false,
): IDiceRoll {
  const n = Math.max(1, Math.min(pool, MAX_POOL));
  return evaluateRoll(Array.from({ length: n }, d10), difficulty, specialty);
}

/** Case-insensitive prefix match against a list. Returns first match. */
function prefixMatch<T extends string>(input: string, list: readonly T[]): T | undefined {
  const lower = input.trim().toLowerCase();
  // Exact match first, then prefix
  return list.find((t) => t.toLowerCase() === lower)
    ?? list.find((t) => t.toLowerCase().startsWith(lower));
}

/**
 * Resolve a trait expression like "str+braw+2" against a character.
 * Accepts exact names, case-insensitive names, and unambiguous prefixes.
 * Returns null if any part is unrecognised.
 */
export function resolvePoolExpr(char: IWoDChar, expr: string): IPoolResolution | null {
  const parts = expr.trim().split(/\s*\+\s*/);
  let total = 0;
  const pubParts:  string[] = [];
  const privParts: string[] = [];

  for (const part of parts) {
    // Plain number
    const n = Number(part.trim());
    if (!isNaN(n) && part.trim() !== "") {
      const v = Math.max(0, Math.floor(n));
      total += v;
      pubParts.push(String(v));
      privParts.push(String(v));
      continue;
    }

    // Attribute (base 1 + extra dots)
    const attr = prefixMatch(part, ALL_ATTRIBUTES);
    if (attr) {
      const val = 1 + (char.attributes[attr] ?? 0);
      total += val;
      pubParts.push(attr);
      privParts.push(`${attr}(${val})`);
      continue;
    }

    // Ability (starts at 0)
    const abil = prefixMatch(part, ALL_ABILITIES);
    if (abil) {
      const val = char.abilities[abil] ?? 0;
      total += val;
      pubParts.push(abil);
      privParts.push(`${abil}(${val})`);
      continue;
    }

    return null; // Unknown part
  }

  return {
    pool:      total,
    pubLabel:  pubParts.join(" + "),
    privLabel: privParts.join(" + "),
  };
}
