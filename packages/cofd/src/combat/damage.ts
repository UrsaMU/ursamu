// Attack damage application for CoFD 2e.
//
// applyAttackDamage wraps the low-level health/track.ts helpers with the
// combat-specific logic: armor subtraction, beaten-down detection, and
// unconscious detection.

import type { CofdSheet } from "../stats/sheet.ts";
import { applyDamage, healthMax, totalDamage } from "../health/index.ts";
import type { DamageType } from "../health/index.ts";

export type AttackDamageType = "bashing" | "lethal";

export interface DamageResult {
  /** Updated copy of the sheet with the new health track. */
  sheet: CofdSheet;
  /** Damage that actually landed after armor (0 when armor absorbed everything). */
  netDamage: number;
  /**
   * True when bashing damage just filled the track that was previously not full.
   * Triggers the Beaten Down tilt.
   */
  beatenDown: boolean;
  /**
   * True when lethal damage just filled the track (Incapacitated threshold).
   */
  unconscious: boolean;
}

/**
 * Apply combat damage to the sheet after armor subtraction.
 *
 * @param sheet            Attacker's target sheet.
 * @param hits             Raw successes + weapon damage modifier (pre-armor).
 * @param damageType       "bashing" or "lethal".
 * @param armorGeneral     General armor rating (applies to all non-firearm attacks).
 * @param armorBallistic   Ballistic armor rating (applies to firearm attacks only).
 * @param isFirearm        True when the attack came from a firearm.
 */
export function applyAttackDamage(
  sheet: CofdSheet,
  hits: number,
  damageType: AttackDamageType,
  armorGeneral: number,
  armorBallistic: number,
  isFirearm: boolean,
): DamageResult {
  const armor = isFirearm ? armorBallistic : armorGeneral;
  const netDamage = Math.max(0, hits - armor);

  const track = sheet.health ?? { bashing: 0, lethal: 0, aggravated: 0 };
  const max = healthMax(sheet);

  const _wasFullBefore = totalDamage(track) >= max;

  const damType: DamageType = damageType;
  const newTrack = applyDamage(track, netDamage, damType, max);
  const isFullAfter = totalDamage(newTrack) >= max;

  const stamina = sheet.attributes?.stamina ?? sheet.attributes?.Stamina ?? 1;
  const beatenDown =
    (damageType === "bashing" && netDamage > stamina) ||
    (damageType === "lethal" && netDamage > 0);
  const unconscious = damageType === "lethal" && isFullAfter;

  const newSheet: CofdSheet = {
    ...sheet,
    health: newTrack,
  };

  return { sheet: newSheet, netDamage, beatenDown, unconscious };
}
