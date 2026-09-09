// core/disciplineCombat.ts -- Potence / Fortitude / Celerity combat hooks.

import type { IWoDChar } from "./types.ts";
import { discDots } from "../splats/vtm/data/powers.ts";
import { isKindred } from "./kindred.ts";
import { spendPool, bloodPerTurnLimit } from "./pools.ts";

/** Potence: automatic successes added to Strength damage pools. */
export function potenceAutoSuccesses(char: IWoDChar): number {
  if (!isKindred(char)) return 0;
  return Math.max(0, discDots(char.disciplines, "Potence"));
}

/** Fortitude dots added to soak pools. */
export function fortitudeSoakBonus(char: IWoDChar): number {
  if (!isKindred(char)) return 0;
  return Math.max(0, discDots(char.disciplines, "Fortitude"));
}

/** True if Kindred may attempt to soak aggravated (has Fortitude). */
export function canSoakAggravated(char: IWoDChar): boolean {
  return fortitudeSoakBonus(char) > 0;
}

/**
 * Soak pool for a damage type.
 * B/L: Stamina + armor + Fortitude - wounds (caller adds armor/wounds).
 * A: Fortitude only (if any).
 */
export function kindredSoakDice(
  char: IWoDChar,
  damageType: "B" | "L" | "A",
  staminaPool: number,
): number {
  const fort = fortitudeSoakBonus(char);
  if (damageType === "A") {
    return fort > 0 ? fort : 0;
  }
  return Math.max(0, staminaPool + fort);
}

/** Remaining Celerity extra actions this turn. */
export function celerityLeft(char: IWoDChar): number {
  return Math.max(0, char.celerityActions ?? 0);
}

/**
 * Activate Celerity: spend blood to bank extra actions (no split tax).
 * Amount capped by Celerity dots, bloodPerTurn, and available blood.
 */
export function activateCelerity(
  char: IWoDChar,
  want = 1,
): {
  ok: boolean;
  message: string;
  gained?: number;
  bloodLeft?: number;
} {
  if (!isKindred(char)) {
    return { ok: false, message: "Only Kindred use Celerity." };
  }
  const dots = discDots(char.disciplines, "Celerity");
  if (dots < 1) {
    return { ok: false, message: "You have no Celerity." };
  }
  const n = Math.max(1, Math.floor(want));
  const cap = Math.min(n, dots, bloodPerTurnLimit(char));
  const spend = spendPool(char, "blood", cap);
  if (!spend.ok || spend.remaining === undefined) {
    return { ok: false, message: spend.message };
  }
  char.bloodPool = spend.remaining;
  char.celerityActions = celerityLeft(char) + cap;
  return {
    ok: true,
    message:
      `Celerity: +${cap} extra action${cap === 1 ? "" : "s"} this turn ` +
      `(-${cap} Blood -> ${spend.remaining}/${char.bloodMax}). ` +
      `Remaining: ${char.celerityActions}.`,
    gained: cap,
    bloodLeft: spend.remaining,
  };
}

/**
 * If Celerity actions remain, consume one and return true
 * (caller should skip split penalty for this attack).
 */
export function consumeCelerityAction(char: IWoDChar): boolean {
  const left = celerityLeft(char);
  if (left < 1) return false;
  char.celerityActions = left - 1;
  if (char.celerityActions <= 0) char.celerityActions = undefined;
  return true;
}
