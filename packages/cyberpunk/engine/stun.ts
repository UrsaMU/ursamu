/**
 * Cyberpunk RED -- Stun Pool / Non-Lethal Damage
 *
 * Pure helpers for non-lethal (stun) damage routing -- rubber ammo, certain
 * brawl effects, etc. CPR Core does not define an explicit numeric stun
 * pool; it describes non-lethal damage and unconsciousness narratively
 * (see rubber ammo, choke holds, p.179 / p.187 / p.220). To give the
 * system a concrete pool we mirror HP:
 *
 *   stun.max = char.hp.max   (i.e. 10 + ceil((BODY + WILL) / 2))
 *
 * This is an in-system assumption; if CPR errata later specifies
 * `BODY * 5` or similar, update STUN_MAX_FORMULA in one place.
 *
 * Stun current starts at stun.max. Non-lethal damage decreases it.
 * When stun.current <= 0 the character is knocked out. A Short Rest
 * fully restores the pool (`recoverStun`).
 */
import type { ICPRCharacter } from "../db/schemas.ts";

/** Compute max stun pool from a character. Mirrors HP max. */
export const calcMaxStun = (char: ICPRCharacter): number => char.hp.max;

/**
 * Lazy init -- if `stun` field is missing (legacy chars, NPC stubs), populate
 * it at full. Returns a new character; never mutates.
 */
export const ensureStunPool = (char: ICPRCharacter): ICPRCharacter => {
  if (char.stun && typeof char.stun.max === "number") return char;
  const max = calcMaxStun(char);
  return { ...char, stun: { current: max, max } };
};

/** True when the character has been knocked out by non-lethal damage. */
export const isUnconscious = (char: ICPRCharacter): boolean => {
  const s = char.stun;
  if (!s) return false;
  return s.current <= 0;
};

/**
 * Apply non-lethal damage to a character's stun pool.
 * Returns new character and whether this hit knocked them out.
 */
export const applyStunDamage = (
  char: ICPRCharacter,
  amount: number,
): { char: ICPRCharacter; knockedOut: boolean } => {
  if (amount <= 0) {
    const ensured = ensureStunPool(char);
    return { char: ensured, knockedOut: isUnconscious(ensured) };
  }
  const base = ensureStunPool(char);
  const wasOut = isUnconscious(base);
  const newCurrent = Math.max(0, base.stun!.current - amount);
  const updated: ICPRCharacter = {
    ...base,
    stun: { ...base.stun!, current: newCurrent },
  };
  const nowOut = newCurrent <= 0;
  return { char: updated, knockedOut: !wasOut && nowOut };
};

/**
 * Fully restore the stun pool. Call from rest recovery (Short Rest or longer).
 */
export const recoverStun = (char: ICPRCharacter): ICPRCharacter => {
  const base = ensureStunPool(char);
  return { ...base, stun: { ...base.stun!, current: base.stun!.max } };
};
