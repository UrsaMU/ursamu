/**
 * Cyberpunk RED -- Ongoing Ammo Effects (engine layer, pure functions).
 *
 * Tracks burn / poison / EMP / sleep / biotoxin status applied on hit by
 * special ammunition. Rubber (stun) is owned by the stun-pool subsystem
 * elsewhere -- this module ignores it. Smoke is room-level, handled via
 * smokeRoomEffect() which returns a payload the caller stamps onto the
 * room's state.
 *
 * Source: CPR Core p.346-347.
 */
import type { ICPRCharacter, IAmmoEffectState } from "../db/schemas.ts";
import type { IAmmoEffect } from "../data/ammo.ts";
import { d6, rollD10Critical } from "./dice.ts";

const POISON_DURATION = 3;
const BIOTOXIN_DURATION = 3;
const SLEEP_DURATION = 10; // ~1 minute in 6-sec rounds
const SMOKE_DURATION = 6;
const BURN_INDEFINITE = -1;

/** Roll a Resistance save: WILL + Resist Torture/Drugs + 1d10. */
export const rollResistSave = (
  will: number,
  resistSkill: number,
): { roll: number; total: number } => {
  const { total: rollTotal } = rollD10Critical();
  return { roll: rollTotal, total: will + resistSkill + rollTotal };
};

/** Roll 1d6 for EMP duration. */
export const rollEmpDuration = (): number => d6();

/**
 * Append an ammo effect to a character's active-effects list.
 *
 * - burn / emp: always applied (no save).
 * - poison / sleep / biotoxin: only applied if savedRoll < hit.dv.
 * - stun: ignored here (owned by stun-pool agent).
 * - smoke: ignored here (room-level, use smokeRoomEffect()).
 */
export const enqueueAmmoEffect = (
  state: IAmmoEffectState[],
  hit: IAmmoEffect,
  savedRoll?: number,
  sourceId?: string,
): IAmmoEffectState[] => {
  const next = state.slice();
  if (hit.effect === "stun" || hit.effect === "smoke") return next;

  if (hit.effect === "burn") {
    next.push({
      effect: "burn",
      remainingTurns: BURN_INDEFINITE,
      damagePerTurn: 1,
      sourceId,
    });
    return next;
  }

  if (hit.effect === "emp") {
    next.push({
      effect: "emp",
      remainingTurns: rollEmpDuration(),
      damagePerTurn: 0,
      sourceId,
    });
    return next;
  }

  // Save-required effects: only enqueue on failed save.
  const dv = hit.dv ?? 15;
  if (savedRoll === undefined || savedRoll >= dv) return next;

  if (hit.effect === "poison") {
    next.push({
      effect: "poison",
      remainingTurns: hit.duration ?? POISON_DURATION,
      damagePerTurn: d6(),
      dvSavedAt: savedRoll,
      sourceId,
    });
    return next;
  }
  if (hit.effect === "biotoxin") {
    next.push({
      effect: "biotoxin",
      remainingTurns: hit.duration ?? BIOTOXIN_DURATION,
      damagePerTurn: d6(),
      dvSavedAt: savedRoll,
      sourceId,
    });
    return next;
  }
  if (hit.effect === "sleep") {
    next.push({
      effect: "sleep",
      remainingTurns: hit.duration ?? SLEEP_DURATION,
      damagePerTurn: 0,
      dvSavedAt: savedRoll,
      sourceId,
    });
    return next;
  }
  return next;
};

/**
 * Advance every active effect by one turn. Returns total damage to apply,
 * and partitioned remaining vs expired effects. Caller is responsible for
 * persisting the new state and applying damage via applyDamageToChar.
 */
export const tickAmmoEffects = (
  char: ICPRCharacter,
): { damage: number; expired: IAmmoEffectState[]; remaining: IAmmoEffectState[] } => {
  const active = char.activeAmmoEffects ?? [];
  let damage = 0;
  const remaining: IAmmoEffectState[] = [];
  const expired: IAmmoEffectState[] = [];
  for (const e of active) {
    damage += e.damagePerTurn ?? 0;
    const next = e.remainingTurns < 0
      ? e.remainingTurns
      : e.remainingTurns - 1;
    if (next === 0) expired.push({ ...e, remainingTurns: 0 });
    else remaining.push({ ...e, remainingTurns: next });
  }
  return { damage, expired, remaining };
};

/** Remove all active burn effects (used by snuff / DV13 Athletics). */
export const extinguishBurn = (state: IAmmoEffectState[]): IAmmoEffectState[] =>
  state.filter((e) => e.effect !== "burn");

/** Room-level smoke payload. Caller stamps this onto the room state. */
export interface ISmokeRoomEffect {
  type: "smoke";
  appliedAt: number;
  expiresAtRound: number;   // current round + duration
  taskPenalty: number;      // -4 to targeted actions inside (CPR p.347)
}

export const smokeRoomEffect = (currentRound: number): ISmokeRoomEffect => ({
  type: "smoke",
  appliedAt: Date.now(),
  expiresAtRound: currentRound + SMOKE_DURATION,
  taskPenalty: -4,
});

/** Human-readable label for an effect (display layer convenience). */
export const effectLabel = (e: IAmmoEffectState): string => {
  switch (e.effect) {
    case "burn":     return "Burning";
    case "poison":   return "Poisoned";
    case "emp":      return "EMP'd";
    case "sleep":    return "Asleep";
    case "biotoxin": return "Biotoxin";
  }
};
