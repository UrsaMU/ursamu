/**
 * Cyberpunk RED -- Combat Calculation Utilities
 * Attack resolution, armor, initiative, aimed shots.
 */
import { rollDamage, rollD10Critical, applyArmor as calcNetDamage, IDamageResult } from "./dice.ts";
import type { IArmorState, ICPRCharacter } from "../db/schemas.ts";
import { isCriticalHit } from "../data/weapons.ts";
import {
  type AmmoType, type ArmorTier, type IAmmoEffect,
  canHarmTarget, effectiveSpForAmmo, finalDamageForAmmo, isNonLethal, onHitEffects,
} from "../data/ammo.ts";

/** Map a raw SP value to a CPR armor tier (CPR Core armor table). */
export const armorTierForSp = (sp: number): ArmorTier => {
  if (sp <= 0)  return "none";
  if (sp <= 10) return "light";
  if (sp <= 12) return "medium";
  if (sp <= 17) return "heavy";
  return "metal";
};

// -- Attack Resolution ---------------------------------------------------------

export type AttackLocation = "body" | "head";

export interface IAttackOptions {
  attackerStat: number;   // REF for ranged, DEX for melee
  attackerSkill: number;
  defenderDV?: number;    // if set, vs DV not opposed roll
  defenderStat?: number;  // for opposed: DEX + Evasion
  defenderSkill?: number;
  aimed?: boolean;        // aimed shot: -8 to attack, +1 damage on hit
  calledShot?: boolean;   // called shot: -8 to attack (location effect handled by caller)
  location?: AttackLocation;
  damageDice: number;
  meleeBody?: number;     // add BODY to melee damage total
  autofireMode?: boolean; // autofire: 3 rounds in burst
  luckSpend?: number;     // Luck points added to roll
  ammoType?: AmmoType;    // loaded ammo (defaults to "basic")
}

export interface IAttackResult {
  attackRoll: number;
  attackTotal: number;
  defenseTotal: number;
  hit: boolean;
  location: AttackLocation;
  damageResult: IDamageResult;
  rawDamage: number;      // before armor
  netDamage: number;      // after armor
  isCritical: boolean;
  aimedMultiplier: number;
  ammoType: AmmoType;
  nonLethal: boolean;
  blockedByArmor: boolean; // expansive vs. armored target -- no damage applied
  ammoEffects: IAmmoEffect[];
}

/**
 * Resolve a complete attack action.
 * Returns all data needed for the hook payload and display.
 */
export const resolveAttack = (
  opts: IAttackOptions,
  armorSp: number
): IAttackResult => {
  const { base, total: rollD10 } = rollD10Critical();
  const attackRoll = rollD10;
  const aimPenalty = opts.aimed ? -8 : 0;
  const calledPenalty = opts.calledShot ? -8 : 0;
  const attackTotal = opts.attackerStat + opts.attackerSkill + attackRoll
    + aimPenalty + calledPenalty + (opts.luckSpend ?? 0);

  // Defense: either DV or opposed roll
  let defenseTotal: number;
  if (opts.defenderDV !== undefined) {
    defenseTotal = opts.defenderDV;
  } else if (opts.defenderStat !== undefined && opts.defenderSkill !== undefined) {
    const { total: defRoll } = rollD10Critical();
    defenseTotal = opts.defenderStat + opts.defenderSkill + defRoll;
  } else {
    defenseTotal = 15; // default DV
  }

  const hit = attackTotal >= defenseTotal;
  const location = opts.location ?? "body";

  // Ammo + armor-tier resolution (CPR Core p.344-347; errata p.345)
  const ammoType = opts.ammoType ?? "basic";
  const tier = armorTierForSp(armorSp);
  const blockedByArmor = hit && !canHarmTarget(ammoType, tier);

  // Damage
  const damageResult = rollDamage(opts.damageDice);
  let rawDamage = damageResult.total;
  if (opts.meleeBody) rawDamage += opts.meleeBody;
  if (opts.aimed && hit) rawDamage += 1;          // aimed shot: +1 damage on hit
  rawDamage = finalDamageForAmmo(ammoType, rawDamage, tier);
  const aimedMultiplier = opts.aimed ? 1 : 1;     // legacy field; aimed no longer multiplies

  const effectiveSp = effectiveSpForAmmo(ammoType, armorSp);

  // Head hits double damage AFTER armor (CPR Core p.180)
  let netDamage = hit && !blockedByArmor ? calcNetDamage(rawDamage, effectiveSp) : 0;
  if (hit && !blockedByArmor && location === "head") netDamage *= 2;

  return {
    attackRoll: base,
    attackTotal,
    defenseTotal,
    hit,
    location,
    damageResult,
    rawDamage: hit ? rawDamage : 0,
    netDamage,
    isCritical: hit && !blockedByArmor && isCriticalHit(damageResult.dice),
    aimedMultiplier: opts.aimed ? aimedMultiplier : 1,
    ammoType,
    nonLethal: isNonLethal(ammoType),
    blockedByArmor,
    ammoEffects: hit && !blockedByArmor ? onHitEffects(ammoType) : [],
  };
};

// -- Autofire ------------------------------------------------------------------

export interface IAutofireResult {
  hit: boolean;
  attackTotal: number;
  defenseTotal: number;
  sv: number;           // Stagger Value: min(margin, autofireMax)
  autofireMax: number;  // weapon cap used
  diceResult: IDamageResult | null; // 2d6 roll (null on miss)
  totalDamage: number;  // 2d6 result × sv
  netDamage: number;    // after armor
}

/**
 * Autofire (CPR Core p.195):
 * - Attacker rolls REF + Autofire skill + 1d10 vs target DV.
 * - Damage = 2d6 × SV where SV = min(margin, autofireMax).
 * - Costs 10 bullets per burst.
 * Uses Autofire skill (not Handgun/Shoulder Arms).
 */
export const resolveAutofire = (
  atkStat: number,
  autofireSkill: number,
  defenderDV: number,
  armorSp: number,
  autofireMax: number,
  luckSpend = 0
): IAutofireResult => {
  const { total: rollD10 } = rollD10Critical();
  const attackTotal = atkStat + autofireSkill + rollD10 + luckSpend;
  const hit = attackTotal >= defenderDV;

  if (!hit) {
    return { hit, attackTotal, defenseTotal: defenderDV, sv: 0, autofireMax, diceResult: null, totalDamage: 0, netDamage: 0 };
  }

  // SV = amount you beat DV by, capped at the weapon's autofire max (default 4)
  const margin = Math.max(0, attackTotal - defenderDV);
  const cap = autofireMax > 0 ? autofireMax : 4;
  const sv = Math.min(margin, cap);

  // Always 2d6, multiplied by SV
  const diceResult = rollDamage(2);
  const totalDamage = diceResult.total * sv;
  const netDamage = calcNetDamage(totalDamage, armorSp);

  return { hit, attackTotal, defenseTotal: defenderDV, sv, autofireMax, diceResult, totalDamage, netDamage };
};

// -- Armor Ablation ------------------------------------------------------------

/**
 * Ablate armor by 1 SP after it takes a hit.
 * Returns the updated armor state.
 */
export const ablateArmorState = (armor: IArmorState | null): IArmorState | null => {
  if (!armor) return null;
  return { ...armor, currentSp: Math.max(0, armor.currentSp - 1) };
};

// -- Effective SP Resolution ---------------------------------------------------

/**
 * Get effective SP for a location.
 * Worn armor and subdermal armor do NOT stack -- use the highest.
 *
 * @param halveSP - When true, halves the SP (round up) before returning.
 *   Book rule: melee weapon attacks halve the target's SP. Brawling/unarmed
 *   do NOT halve SP. (CPR Core p.170)
 */
export const effectiveSP = (
  char: ICPRCharacter,
  location: AttackLocation,
  halveSP = false,
): number => {
  const worn = location === "head"
    ? (char.armorHead?.currentSp ?? 0)
    : (char.armorBody?.currentSp ?? 0);

  // Subdermal SP from the tracked pool (set on install of subdermal_armor/skin_weave)
  const subdermalSP = char.subdermalArmorSp ?? 0;

  const base = Math.max(worn, subdermalSP);
  return halveSP ? Math.ceil(base / 2) : base;
};

/**
 * Determine which armor source to ablate after a hit, and return the field path
 * and new SP value. Only body location armor is compared; head armor never has
 * a subdermal equivalent.
 *
 * Returns: { source: "worn" | "subdermal", newSp: number }
 */
export const ablateArmorSource = (
  char: ICPRCharacter,
  location: AttackLocation,
): { source: "worn" | "subdermal"; newSp: number } => {
  if (location === "head") {
    // Head armor is always worn; subdermal doesn't cover head
    const currentSp = char.armorHead?.currentSp ?? 0;
    return { source: "worn", newSp: Math.max(0, currentSp - 1) };
  }
  const wornSP = char.armorBody?.currentSp ?? 0;
  const subdermalSP = char.subdermalArmorSp ?? 0;
  // Ablate whichever source was providing the effective SP (higher wins)
  if (subdermalSP > wornSP) {
    return { source: "subdermal", newSp: Math.max(0, subdermalSP - 1) };
  }
  return { source: "worn", newSp: Math.max(0, wornSP - 1) };
};

// -- Range Difficulty Values ---------------------------------------------------

export type RangeCategory = "point_blank" | "close" | "medium" | "long" | "extreme";

export const RANGE_DV: Record<RangeCategory, number> = {
  point_blank: 10,
  close: 15,
  medium: 20,
  long: 25,
  extreme: 30,
};

// -- Initiative Queue ----------------------------------------------------------

import type { ICombatActor } from "../db/schemas.ts";

/**
 * Sort actors by initiative (descending). Ties: no resolution needed (book says no tie-breaker).
 */
export const sortInitiative = (actors: ICombatActor[]): ICombatActor[] =>
  [...actors].sort((a, b) => b.initiative - a.initiative);

/**
 * Advance to the next actor in queue.
 * Returns new index and whether round wrapped.
 */
export const advanceTurn = (
  queue: ICombatActor[],
  currentIndex: number
): { nextIndex: number; newRound: boolean } => {
  const nextIndex = (currentIndex + 1) % queue.length;
  return { nextIndex, newRound: nextIndex === 0 };
};

// -- Dodge ---------------------------------------------------------------------

/**
 * Dodge check: DEX + Evasion + 1d10.
 * Can dodge ranged attacks only if REF >= 8.
 */
export const canDodgeRanged = (ref: number): boolean => ref >= 8;

// -- Reputation Facedown -------------------------------------------------------

/**
 * Facedown: COOL + Reputation + 1d10.
 * Negative reputation counts against you.
 */
export const facedownTotal = (cool: number, reputation: number, d10Roll: number): number =>
  cool + reputation + d10Roll;

/** Outcome of a single facedown contest. */
export type FacedownOutcome = "attacker" | "defender" | "stalemate";

/**
 * Resolve a facedown. On a tie the contest re-rolls once; a second tie is a
 * stalemate (neither side backs down). CPR Core p.131.
 */
export const resolveFacedown = (
  rollD10: () => number,
  attacker: { cool: number; reputation: number },
  defender: { cool: number; reputation: number },
): {
  outcome: FacedownOutcome;
  rolls: { attacker: number; defender: number }[];
  attackerTotal: number;
  defenderTotal: number;
} => {
  const rolls: { attacker: number; defender: number }[] = [];
  let aTotal = 0, dTotal = 0;
  for (let i = 0; i < 2; i++) {
    const a = rollD10();
    const d = rollD10();
    rolls.push({ attacker: a, defender: d });
    aTotal = facedownTotal(attacker.cool, attacker.reputation, a);
    dTotal = facedownTotal(defender.cool, defender.reputation, d);
    if (aTotal !== dTotal) break;
  }
  const outcome: FacedownOutcome =
    aTotal === dTotal ? "stalemate" : aTotal > dTotal ? "attacker" : "defender";
  return { outcome, rolls, attackerTotal: aTotal, defenderTotal: dTotal };
};

/** Scene length for the "impressed" condition, in ms (~5 minutes). */
export const FACEDOWN_SCENE_MS = 5 * 60 * 1000;

/** -2 to attacks taken against the actor who just impressed you. */
export const IMPRESSED_ATTACK_PENALTY = -2;

/**
 * Returns true when `cpr` is currently impressed by `targetId` and the
 * condition has not yet expired. Stale entries return false.
 */
export const isImpressedBy = (
  cpr: { impressedBy?: { actorId: string; expiresAt: number } | null },
  targetId: string,
  now: number = Date.now(),
): boolean => {
  const i = cpr.impressedBy;
  return !!i && i.actorId === targetId && i.expiresAt > now;
};
