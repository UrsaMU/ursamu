/**
 * Cyberpunk RED -- FNFF Utility Functions
 * Called shots, brawling special moves, and location effects.
 * CPR Core Chapter 13 -- Friday Night Firefight (optional rules).
 */
import type { ICPRCharacter } from "../db/schemas.ts";
import { rollD10Critical } from "./dice.ts";

// -- Location Effect Types ------------------------------------------------------

export type CalledShotLocation = "arm" | "leg" | "hand" | "eye";
export type LocationEffectType =
  | "arm_disabled" | "leg_slowed" | "hand_disabled" | "eye_damaged"
  | "grabbed" | "pinned";

export interface ILocationEffect {
  type: LocationEffectType;
  source: string;      // player ID who applied it
  appliedAt: number;   // timestamp
}

/** Maps called shot location to the persistent effect type applied. */
export const CALLED_SHOT_EFFECT: Record<CalledShotLocation, LocationEffectType> = {
  arm:  "arm_disabled",
  leg:  "leg_slowed",
  hand: "hand_disabled",
  eye:  "eye_damaged",
};

/** In-game narrative description of each called shot effect. */
export const CALLED_SHOT_NARRATIVE: Record<CalledShotLocation, string> = {
  arm:  "target must pass BODY DV15 check or drop their weapon",
  leg:  "target's MOVE is halved for this scene",
  hand: "target's affected hand is disabled for this scene",
  eye:  "target takes -3 to all Awareness/Perception rolls",
};

/** True if the character currently has the given location effect active. */
export const hasLocationEffect = (
  cpr: ICPRCharacter,
  type: LocationEffectType,
): boolean => (cpr.locationEffects ?? []).some((e) => e.type === type);

/** Return a new effects array with the given effect appended (does not mutate). */
export const addLocationEffect = (
  effects: ILocationEffect[],
  type: LocationEffectType,
  sourceId: string,
): ILocationEffect[] => [...effects, { type, source: sourceId, appliedAt: Date.now() }];

// -- Brawl Resolution ----------------------------------------------------------

export interface IBrawlResult {
  atkTotal: number;
  defTotal: number;
  success: boolean;
}

/**
 * Opposed grapple check: DEX + Brawling + 1d10 vs DEX + resistSkill + 1d10.
 * Ties go to the defender.
 */
export const resolveBrawlOpposed = (
  atkDex: number,
  atkBrawl: number,
  defDex: number,
  defSkill: number,
): IBrawlResult => {
  const { total: atkRoll } = rollD10Critical();
  const { total: defRoll } = rollD10Critical();
  const atkTotal = atkDex + atkBrawl + atkRoll;
  const defTotal = defDex + defSkill + defRoll;
  return { atkTotal, defTotal, success: atkTotal > defTotal };
};

/**
 * Brawl check against a flat DV: stat + brawlSkill + 1d10 vs DV.
 */
export const resolveBrawlDV = (
  atkStat: number,
  atkSkill: number,
  dv: number,
): IBrawlResult => {
  const { total: atkRoll } = rollD10Critical();
  const atkTotal = atkStat + atkSkill + atkRoll;
  return { atkTotal, defTotal: dv, success: atkTotal >= dv };
};
