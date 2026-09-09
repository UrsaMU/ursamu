// core/spot.ts -- pure spotting helpers.
//
// Wraps CONCEAL_DIFFICULTY from core/eq.ts so command code (and tests) have
// a single entry point for "what is the difficulty to spot this item?".
import { CONCEAL_DIFFICULTY, getEqMeta } from "./eq.ts";
import type { Concealability } from "./eq.ts";

// deno-lint-ignore no-explicit-any
type AnyObj = any;

/**
 * Difficulty to spot a concealed item. Falls back to Trenchcoat (6) when
 * concealability is unset or unrecognised. Returns "auto" for N items,
 * which the spot command resolves as an automatic find.
 */
export function concealDifficulty(item: AnyObj): number | "auto" {
  const c = getEqMeta(item).concealability;
  if (!c) return CONCEAL_DIFFICULTY.T;
  const v = CONCEAL_DIFFICULTY[c as Concealability];
  return v ?? CONCEAL_DIFFICULTY.T;
}

export { CONCEAL_DIFFICULTY };
