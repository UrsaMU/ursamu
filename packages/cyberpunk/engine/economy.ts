/**
 * Cyberpunk RED -- Economy and Drug Effect Utilities
 */
import type { ICPRCharacter, IDrugEffect } from "../db/schemas.ts";
import { getDrug } from "../data/drugs.ts";

// -- Drug Application ----------------------------------------------------------

/**
 * Apply a drug effect to a character. Returns updated activeEffects list.
 * Multiple drugs can be stacked. Instant-effect drugs (durationMs === 0) are
 * applied immediately and not tracked.
 */
export const applyDrug = (
  char: ICPRCharacter,
  drugName: string
): { newEffects: IDrugEffect[]; isInstant: boolean; effect: string } => {
  const def = getDrug(drugName);
  if (!def) return { newEffects: char.activeEffects, isInstant: false, effect: "Unknown drug." };

  if (def.durationMs === 0) {
    // Instant effect -- caller handles mechanical result
    return { newEffects: char.activeEffects, isInstant: true, effect: def.effects };
  }

  const newEffect: IDrugEffect = {
    drug: drugName,
    effect: def.effects,
    expiresAt: Date.now() + def.durationMs,
  };

  // Replace existing effect of same drug (no double-stacking same drug)
  const filtered = char.activeEffects.filter((e) => e.drug !== drugName);
  return { newEffects: [...filtered, newEffect], isInstant: false, effect: def.effects };
};

/** Remove all drug effects (Rapidetox). */
export const purgeAllDrugEffects = (): IDrugEffect[] => [];

/** Check for and remove expired effects. Returns cleaned list. */
export const pruneExpiredEffects = (effects: IDrugEffect[]): IDrugEffect[] => {
  const now = Date.now();
  return effects.filter((e) => e.expiresAt > now);
};

/** Check if a specific drug is currently active. */
export const isDrugActive = (char: ICPRCharacter, drugName: string): boolean =>
  char.activeEffects.some((e) => e.drug === drugName && e.expiresAt > Date.now());

// -- Speedheal -----------------------------------------------------------------

/**
 * Speedheal: heals BODY + WILL HP instantly. Once per day.
 * Caller must check once-per-day constraint.
 */
export const speedhealAmount = (body: number, will: number): number =>
  body + will;

// -- Drug Synthesis Time -------------------------------------------------------

/**
 * Synthesis time is based on materials price category (same as crafting DV/time).
 * Simple pharma: Cheap/Everyday = 1 hour; complex combat drugs = longer.
 */
export const synthesisDurationMs = (priceCategory: string): number => {
  const map: Record<string, number> = {
    cheap: 60 * 60 * 1000,
    everyday: 60 * 60 * 1000,
    costly: 6 * 60 * 60 * 1000,
    premium: 24 * 60 * 60 * 1000,
    expensive: 3 * 24 * 60 * 60 * 1000,
    very_expensive: 7 * 24 * 60 * 60 * 1000,
  };
  return map[priceCategory.toLowerCase()] ?? 60 * 60 * 1000;
};

// -- Income / Reputation Bonuses -----------------------------------------------

/**
 * Fixer Haggle: amount saved from a purchase.
 * 10% at Rank 1-4, 15% at 5-8, 20% at 9-10.
 */
export const fixerHaggledSavings = (rank: number, originalPrice: number): number => {
  const pct = rank >= 9 ? 0.2 : rank >= 5 ? 0.15 : 0.1;
  return Math.floor(originalPrice * pct);
};

/** Nomad vehicle repair cost for destroyed Family Vehicle. */
export const NOMAD_REPAIR_COST = 500;

// -- Scavenge EB Range ---------------------------------------------------------

/** Roll a random EB amount within a range. */
export const rollEBRange = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;
