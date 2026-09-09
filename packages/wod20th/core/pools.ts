// core/pools.ts -- Pure spend/regain logic for Rage, Gnosis, and Willpower pools.
// Read-only helpers; the caller is responsible for persisting any changes via
// db.modify / saveChar. Each function validates the requested delta against the
// character's permanent (max) and current values and returns a discriminated
// result rather than throwing.
import type { IWoDChar } from "./types.ts";

/** Identifier for one of the temporary trait pools (incl. VtM blood). */
export type Pool = "rage" | "gnosis" | "willpower" | "blood";

/** Hard cap on any pool's permanent rating (M20). */
export const POOL_CAP = 10;

/**
 * Resolve the permanent (max) and current values for `pool` on `char`.
 * Returns `undefined` for `permanent` if the character does not have this pool
 * (e.g. mortals have no rage/gnosis). Current defaults to permanent when unset.
 */
function readPool(
  char: IWoDChar,
  pool: Pool,
): { permanent: number | undefined; current: number } {
  switch (pool) {
    case "blood": {
      const permanent = char.bloodMax;
      const current = char.bloodPool ?? permanent ?? 0;
      return { permanent, current };
    }
    case "rage": {
      const permanent = char.rage;
      const current = char.rageCurrent ?? permanent ?? 0;
      return { permanent, current };
    }
    case "gnosis": {
      const permanent = char.gnosis;
      const current = char.gnosisCurrent ?? permanent ?? 0;
      return { permanent, current };
    }
    case "willpower": {
      const permanent = char.willpower;
      const current = char.willpowerCurrent ?? permanent;
      return { permanent, current };
    }
  }
}

/** Display label for a pool, capitalized for player-facing messages. */
function label(pool: Pool): string {
  return pool[0].toUpperCase() + pool.slice(1);
}

/** Reject zero, negative, fractional, NaN, and Infinity. */
function isPositiveInteger(n: number): boolean {
  return Number.isInteger(n) && n > 0 && Number.isFinite(n);
}

/**
 * Spend `amount` points from the named pool.
 *
 * @returns `{ ok: true, remaining }` when the spend succeeds, or
 *          `{ ok: false, message }` on validation/insufficient-pool failure.
 *          Never mutates `char` -- caller persists via db.modify.
 */
export function spendPool(
  char: IWoDChar,
  pool: Pool,
  amount: number,
): { ok: boolean; message: string; remaining?: number } {
  if (!isPositiveInteger(amount)) {
    return { ok: false, message: "Amount must be a positive integer." };
  }
  const { permanent, current } = readPool(char, pool);
  if (permanent === undefined || permanent <= 0) {
    return { ok: false, message: `You have no ${label(pool)} pool.` };
  }
  if (current < amount) {
    return {
      ok: false,
      message: `Insufficient ${label(pool)} (${current}/${permanent}).`,
    };
  }
  const remaining = current - amount;
  return {
    ok: true,
    message: `Spent ${amount} ${label(pool)}. (${remaining}/${permanent})`,
    remaining,
  };
}

/**
 * Regain `amount` points to the named pool, capped at the permanent rating.
 *
 * @returns `{ ok: true, current }` with the new current value, or
 *          `{ ok: false, message }` on validation failure. Pure -- caller
 *          persists.
 */
export function regainPool(
  char: IWoDChar,
  pool: Pool,
  amount: number,
): { ok: boolean; message: string; current?: number } {
  if (!isPositiveInteger(amount)) {
    return { ok: false, message: "Amount must be a positive integer." };
  }
  const { permanent, current } = readPool(char, pool);
  if (permanent === undefined || permanent <= 0) {
    return { ok: false, message: `You have no ${label(pool)} pool.` };
  }
  const next = Math.min(current + amount, permanent);
  const gained = next - current;
  return {
    ok: true,
    message: gained === 0
      ? `${label(pool)} already full (${current}/${permanent}).`
      : `Regained ${gained} ${label(pool)}. (${next}/${permanent})`,
    current: next,
  };
}

/**
 * VtM: maximum blood a character may spend in a single turn, from the
 * generation table (V20 Ch. 3). Defaults to 1 for 13th-gen-or-thinner
 * characters with no explicit bloodPerTurn seeded.
 */
export function bloodPerTurnLimit(char: IWoDChar): number {
  const n = char.bloodPerTurn;
  return typeof n === "number" && n > 0 ? n : 1;
}

/**
 * VtM: validate and clamp a requested current-blood value into
 * [0, bloodMax]. Discriminated result, matching spendPool/regainPool.
 */
export function clampBloodCurrent(
  char: IWoDChar,
  n: number,
): { ok: boolean; message: string; current?: number } {
  const max = char.bloodMax ?? 10;
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, message: "Blood value must be an integer." };
  }
  if (n < 0) {
    return { ok: false, message: "Blood value cannot be negative." };
  }
  const current = Math.min(max, n);
  return {
    ok: true,
    message: current !== n
      ? `Clamped to max (${current}/${max}).`
      : `Blood set. (${current}/${max})`,
    current,
  };
}
