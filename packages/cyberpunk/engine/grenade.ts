/**
 * Grenade / AoE damage math.
 *
 * Pure functions. Mirrors the damage portion of engine/combat.ts:resolveAttack
 * but for a *per-target* AoE hit where the attack roll has already happened
 * once (against scatter DV) and now every combatant in the radius takes the
 * blast. Default ammo for grenades and rockets is AP (errata p.345).
 *
 * Save-effect grenades (flashbang, teargas, sonic, biotoxin) are resolved by
 * resolveAoeSave() — caller picks save or damage based on the weapon def.
 */

import { rollDamage, applyArmor as calcNetDamage } from "./dice.ts";
import { rollD10Critical } from "./dice.ts";
import { armorTierForSp } from "./combat.ts";
import {
  type AmmoType, type IAmmoEffect,
  canHarmTarget, effectiveSpForAmmo, finalDamageForAmmo, onHitEffects,
} from "../data/ammo.ts";

export interface IGrenadeHitInput {
  damageDice: number;
  ammoType: AmmoType;        // default AP for grenades/rockets
  defenderSp: number;        // already-resolved effective body SP
}

export interface IGrenadeHitResult {
  rawDamage: number;         // after ammo / tier adjustments, before armor
  netDamage: number;         // after armor
  blockedByArmor: boolean;
  effects: IAmmoEffect[];
}

/**
 * Resolve a single AoE damage hit on one target. No to-hit roll — being in
 * the radius IS the hit. Mirrors the damage-resolution branch of
 * resolveAttack() but never doubles for head shots (blasts hit body).
 */
export const resolveGrenadeHit = (
  input: IGrenadeHitInput,
): IGrenadeHitResult => {
  const tier = armorTierForSp(input.defenderSp);
  const blockedByArmor = !canHarmTarget(input.ammoType, tier);
  const dmg = rollDamage(input.damageDice);
  const raw = finalDamageForAmmo(input.ammoType, dmg.total, tier);
  const effSp = effectiveSpForAmmo(input.ammoType, input.defenderSp);
  const net = blockedByArmor ? 0 : calcNetDamage(raw, effSp);
  return {
    rawDamage: blockedByArmor ? 0 : raw,
    netDamage: net,
    blockedByArmor,
    effects: blockedByArmor ? [] : onHitEffects(input.ammoType),
  };
};

export interface IAoeSaveInput {
  saveStatValue: number;     // e.g. defender's BODY
  saveDV: number;
}

export interface IAoeSaveResult {
  roll: number;
  total: number;
  success: boolean;
}

/** DV-based AoE save (flashbang, teargas, sonic, biotoxin, sleep). */
export const resolveAoeSave = (input: IAoeSaveInput): IAoeSaveResult => {
  const { total: roll } = rollD10Critical();
  const total = input.saveStatValue + roll;
  return { roll, total, success: total >= input.saveDV };
};
