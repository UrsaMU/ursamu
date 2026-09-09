// core/umbra.ts -- WtA "Step Sideways" mechanic.
//
// Pure logic only. No mutation of the character; no persistence. The caller
// (commands/stepside.ts) is responsible for writing inUmbra/gnosisCurrent
// changes via db.modify / saveChar, and for emitting hooks.
//
// Rules (M20 WtA core, p. 250-ish):
//   * Stare into a reflective surface, roll Gnosis vs Gauntlet (default 6).
//   * 1+ successes => shift across the Gauntlet (in or out).
//   * 0 successes  => failed shift, caller spends 1 temporary Gnosis.
//   * Botch        => trapped, dazed, caller spends 1 temporary Gnosis.
import type { IWoDChar } from "./types.ts";
import type { IDiceRoll } from "./dice.ts";
import { rollDice } from "./dice.ts";

/** Default Gauntlet rating used when the locale does not specify one. */
export const DEFAULT_GAUNTLET = 6;

/** Discriminated outcomes returned by `stepSideways`. */
export type StepOutcome = "entered" | "exited" | "failed" | "botched";

export interface IStepSidewaysResult {
  ok:      boolean;
  roll:    IDiceRoll;
  outcome: StepOutcome;
}

/** Convenience predicate -- avoids spreading `!!` checks across callers. */
export function isInUmbra(char: IWoDChar): boolean {
  return char.inUmbra === true;
}

/**
 * Attempt to step sideways. Pure: never mutates `char`.
 *
 * @param char     the Garou attempting the shift
 * @param gauntlet local Gauntlet rating (defaults to {@link DEFAULT_GAUNTLET})
 * @param roller   optional dice roller injection for deterministic tests
 */
export function stepSideways(
  char: IWoDChar,
  gauntlet: number = DEFAULT_GAUNTLET,
  roller: (pool: number, difficulty: number) => IDiceRoll = rollDice,
): IStepSidewaysResult {
  const pool = Math.max(1, char.gnosisCurrent ?? char.gnosis ?? 0);
  const roll = roller(pool, gauntlet);

  if (roll.botch) {
    return { ok: false, roll, outcome: "botched" };
  }
  if (roll.netSuccesses === 0) {
    return { ok: false, roll, outcome: "failed" };
  }
  return {
    ok: true,
    roll,
    outcome: isInUmbra(char) ? "exited" : "entered",
  };
}
