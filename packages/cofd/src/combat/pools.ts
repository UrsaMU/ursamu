// Attack pool builder for CoFD 2e.
//
// Given the attacker's sheet, the equipped weapon's catalog entry, and the
// attack options, returns the final dice count to pass to executeRoll().

import type { CofdSheet } from "../stats/sheet.ts";
import type { WeaponEntry } from "../equipment/catalog.ts";
import { woundPenalty, healthMax } from "../health/index.ts";
import { type AttackOptions, type ModifierSet, buildModifiers } from "./modifiers.ts";

/** The pool override type (unarmed = Str+Brawl, etc.) */
export type AttackPoolType = "unarmed" | "melee" | "ranged" | "thrown";

export interface BuiltPool {
  /** Final dice count (may be 0 or negative -- caller should treat <= 0 as chance die). */
  total: number;
  /** Base pool before modifiers (attribute + skill). */
  base: number;
  /** Effective Defense subtracted (0 when ranged without exceptions). */
  defenseApplied: number;
  /** Full modifier set for transparency in output. */
  mods: ModifierSet;
  /** Whether the pool has been reduced to chance die range. */
  isChanceDie: boolean;
  /** Short description of the pool formula used. */
  formula: string;
}

function attr(sheet: CofdSheet, name: string): number {
  return (sheet.attributes as Record<string, number>)[name] ?? 1;
}

function skill(sheet: CofdSheet, name: string): number {
  return (sheet.skills as Record<string, number>)[name] ?? 0;
}

/**
 * Determine the natural pool type for a weapon catalog entry.
 * Falls back to "unarmed" when weapon is null.
 */
export function naturalPoolType(
  weaponEntry: WeaponEntry | null,
  weaponCatalogType: "weapon-ranged" | "weapon-melee" | null,
): AttackPoolType {
  if (!weaponEntry || !weaponCatalogType) return "unarmed";
  return weaponCatalogType === "weapon-ranged" ? "ranged" : "melee";
}

/**
 * Build the final dice pool count.
 *
 * targetDefense is the target's computed Defense value (lower of Dex/Wits +
 * Athletics) before any per-round tracking adjustments.  Caller is responsible
 * for supplying 0 when the target is Surprised or the attacker chose all-out.
 */
export function buildPool(
  sheet: CofdSheet,
  poolType: AttackPoolType,
  opts: AttackOptions,
  targetDefense: number,
  extraDice: number = 0,
): BuiltPool {
  const mods = buildModifiers(opts, sheet);

  let base = 0;
  let formula = "";
  let defenseApplied = 0;

  switch (poolType) {
    case "unarmed":
      base = attr(sheet, "strength") + skill(sheet, "brawl");
      formula = "Strength+Brawl";
      defenseApplied = mods.targetSurprised ? 0 : Math.max(0, targetDefense + mods.targetDefenseMod);
      break;
    case "melee":
      base = attr(sheet, "strength") + skill(sheet, "weaponry");
      formula = "Strength+Weaponry";
      defenseApplied = mods.targetSurprised ? 0 : Math.max(0, targetDefense + mods.targetDefenseMod);
      break;
    case "ranged":
      base = attr(sheet, "dexterity") + skill(sheet, "firearms");
      formula = "Dexterity+Firearms";
      // Defense does NOT apply to ranged attacks by default.
      defenseApplied = 0;
      break;
    case "thrown":
      base = attr(sheet, "dexterity") + skill(sheet, "athletics");
      formula = "Dexterity+Athletics";
      defenseApplied = mods.targetSurprised ? 0 : Math.max(0, targetDefense + mods.targetDefenseMod);
      break;
  }

  // Wound penalty from attacker's own health track.
  const health = sheet.health ?? { bashing: 0, lethal: 0, aggravated: 0 };
  const maxHp = healthMax(sheet);
  const wound = woundPenalty(health, maxHp);

  const total = base
    - defenseApplied
    + mods.poolMod
    + mods.coverMod
    + wound
    + extraDice;

  return {
    total,
    base,
    defenseApplied,
    mods,
    isChanceDie: total <= 0,
    formula,
  };
}

/**
 * Compute target's Defense (lower of Dex or Wits) + Athletics.
 * Returned as a raw integer; the caller subtracts appliedDefense for multi-
 * attacker situations.
 */
export function computeDefense(sheet: CofdSheet): number {
  const dex = attr(sheet, "dexterity");
  const wits = attr(sheet, "wits");
  const athletics = skill(sheet, "athletics");
  return Math.min(dex, wits) + athletics;
}

/**
 * When a character Dodges, their Defense is replaced by a dice pool of 2x
 * Defense rolled as a contested action.
 */
export function dodgePool(sheet: CofdSheet): number {
  return computeDefense(sheet) * 2;
}
