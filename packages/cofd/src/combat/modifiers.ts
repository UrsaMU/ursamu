// Pure modifier stack for CoFD 2e attack resolution.
// Takes attack options and returns a ModifierSet that the pool builder
// or attack command can apply.

import type { CofdSheet } from "../stats/sheet.ts";
import { healthMax, sheetWoundPenalty } from "../health/index.ts";

export interface AttackOptions {
  pool?: "unarmed" | "melee" | "ranged" | "thrown";
  allOut?: boolean;
  charge?: boolean;
  aim?: number;           // 0-3 accumulated aim bonus
  offhand?: boolean;
  pulling?: { max: number };
  burstShort?: boolean;
  burstMed?: boolean;
  burstLong?: boolean;
  intoMelee?: number;     // number of bystanders avoided
  concealment?: 1 | 2 | 3;
  targetConcealment?: 1 | 2 | 3;
  targetCover?: number;   // cover Durability (used as pool penalty)
  targetProne?: boolean;
  targetSurprised?: boolean;
  specified?: "torso" | "arm" | "leg" | "head" | "heart" | "hand" | "eye";
  /** Number of targets engaged this burst (1 for single-target). */
  targets?: number;
  /**
   * Optional target sheet -- used by merit hooks (Killer Instinct) that need
   * to inspect the defender's health and tilts. Caller may omit when not
   * available; merit bonuses then simply do not apply.
   */
  targetSheet?: CofdSheet;
  /**
   * Optional explicit beaten-down flag for the target. Overrides any tilt
   * lookup. Useful for NPCs that store the flag elsewhere.
   */
  targetBeatenDown?: boolean;
  /**
   * Attacker's sheet for opt-in wound-penalty deduction. NOTE: pools.ts
   * already applies the wound penalty for combat callers via buildPool;
   * setting this option from a buildPool caller would double-count.
   * Intended for out-of-band callers that compose pool math directly via
   * buildModifiers without going through buildPool.
   */
  attackerSheet?: CofdSheet;
  /** Explicit wound penalty (0..3 positive magnitude); overrides attackerSheet. */
  attackerWoundPenalty?: number;
}

export interface ModifierSet {
  /** Bonus or penalty to the dice pool total. */
  poolMod: number;
  /**
   * Modification to the target's Defense for this attack.
   * Positive means target's Defense is effectively reduced by this much (but
   * all-out/charge bypass is handled separately via targetDefenseOverride).
   */
  targetDefenseMod: number;
  /**
   * Dice penalty from the target's cover (Durability subtracted from pool).
   * Stored separately so the command can show it distinctly in output.
   */
  coverMod: number;
  /** When true the target's Defense is completely bypassed (surprise). */
  targetSurprised: boolean;
  /** When true the attacker loses their own Defense next turn (all-out / charge). */
  attackerLosesDefense: boolean;
}

/** Penalty from shooting into melee to avoid bystanders. */
function intoMeleePenalty(bystanders: number): number {
  if (bystanders <= 0) return 0;
  return -2 * bystanders;
}

/** Bonus / penalty from the target's concealment level when firing back.
 * Per core rules a target in cover suffers the same cover as a penalty to
 * return fire (-1 less than their own cover level). */
function concealmentPenalty(level: 1 | 2 | 3 | undefined): number {
  if (!level) return 0;
  // Level 1: -1  Level 2: -2  Level 3: -3
  return -level;
}

/** Penalty for a specified target location. */
function specifiedPenalty(
  specified: AttackOptions["specified"],
): number {
  if (!specified) return 0;
  switch (specified) {
    case "torso":
      return -1;
    case "arm":
    case "leg":
    case "hand":
      return -2;
    case "head":
      return -3;
    case "heart":
      return -4;
    case "eye":
      return -5;
  }
}

/**
 * Look up a merit dot value on a sheet. Case-insensitive.
 */
function meritDots(sheet: CofdSheet | undefined, key: string): number {
  if (!sheet || !sheet.merits) return 0;
  const lower = key.toLowerCase();
  const m = sheet.merits as Record<string, number>;
  if (typeof m[lower] === "number") return m[lower];
  // Tolerate stored mixed-case keys.
  for (const k of Object.keys(m)) {
    if (k.toLowerCase() === lower) return m[k];
  }
  return 0;
}

/**
 * Fast Reflexes (1-3) -- adds dots to the Initiative formula.
 * Called from `rollInitiative` in encounter.ts.
 */
export function fastReflexesBonus(sheet: CofdSheet | undefined): number {
  return Math.max(0, Math.min(3, meritDots(sheet, "fast reflexes")));
}

/**
 * Returns true when the target is "beaten-down" -- has the beaten-down
 * tilt, the explicit flag, or has lost more than half their max health.
 */
function isWeakenedTarget(
  targetSheet: CofdSheet | undefined,
  explicitBeatenDown: boolean | undefined,
): boolean {
  if (!targetSheet) return false;
  if (explicitBeatenDown === true) return true;
  if (targetSheet.tilts?.some((t) => t.key === "beaten-down")) return true;
  const health = targetSheet.health ?? { bashing: 0, lethal: 0, aggravated: 0 };
  const total = health.bashing + health.lethal + health.aggravated;
  const max = healthMax(targetSheet);
  return max > 0 && total > max / 2;
}

/**
 * Killer Instinct (1-3) -- +dots to attacks against a beaten-down or
 * heavily wounded target. Returns 0 when the merit is absent or the
 * target does not qualify.
 */
export function killerInstinctBonus(
  attackerSheet: CofdSheet | undefined,
  targetSheet: CofdSheet | undefined,
  explicitBeatenDown?: boolean,
): number {
  const dots = meritDots(attackerSheet, "killer instinct");
  if (dots <= 0) return 0;
  if (!isWeakenedTarget(targetSheet, explicitBeatenDown)) return 0;
  return Math.min(3, dots);
}

/**
 * Iron Stamina (1-3) -- reduces an attacker's wound penalty (a negative
 * dice modifier) toward zero by the dots in the merit. Pass the raw
 * wound-penalty integer (always <= 0); the return value is the new
 * penalty after reduction, never positive.
 *
 * Integration: call from within the attack pipeline (Agent B's
 * `applyAttackOptions`) immediately after computing
 * `attackerWoundPenalty`. The clamp guarantees the merit never converts
 * a penalty into a bonus.
 */
export function ironStaminaReducedPenalty(
  attackerSheet: CofdSheet | undefined,
  attackerWoundPenalty: number,
): number {
  if (attackerWoundPenalty >= 0) return attackerWoundPenalty;
  const dots = Math.max(0, Math.min(3, meritDots(attackerSheet, "iron stamina")));
  return Math.min(0, attackerWoundPenalty + dots);
}

/**
 * Quick Draw is instanced per weapon class:
 *   merits["quick draw:firearms"], merits["quick draw:melee"], etc.
 * Returns true when the sheet carries a matching instance.
 *
 * Integration: when `weaponTags.slow` is true on an equipped weapon,
 * `src/commands/gear.ts` should call this with the weapon's class
 * ("firearms" / "melee" / "thrown" / ...) and suppress the Slow note
 * if it returns true.
 */
export function hasMatchingQuickDraw(
  sheet: CofdSheet | undefined,
  weaponClass: string | undefined | null,
): boolean {
  if (!sheet || !weaponClass) return false;
  const cls = weaponClass.toLowerCase().trim();
  if (!cls) return false;
  return meritDots(sheet, `quick draw:${cls}`) > 0;
}

/**
 * Heavy Hitter (3 dots, melee only) -- +1 raw hit when wielding a melee
 * weapon. Returns 0 for ranged attacks or when the merit is absent.
 *
 * Integration: damage.ts (Agent B) should call this after computing raw
 * hits and add the return value before armor subtraction. Pass `true`
 * for `isFirearm` when the equipped weapon is a firearm (or any non-
 * melee weapon); the merit then yields 0.
 */
export function heavyHitterBonus(
  sheet: CofdSheet | undefined,
  isFirearm: boolean,
): number {
  if (isFirearm) return 0;
  return meritDots(sheet, "heavy hitter") >= 3 ? 1 : 0;
}

/**
 * Calculate the full modifier set for one attack.
 *
 * `attackerSheet` is optional; when supplied it enables merit-driven
 * modifiers (currently Killer Instinct). Pre-existing callers that pass
 * only `opts` are unaffected.
 */
export function buildModifiers(
  opts: AttackOptions,
  attackerSheet?: CofdSheet,
): ModifierSet {
  let poolMod = 0;
  let targetDefenseMod = 0;
  const coverMod = -(opts.targetCover ?? 0);
  let attackerLosesDefense = false;

  // All-out attack: +2 dice, attacker loses Defense.
  if (opts.allOut) {
    poolMod += 2;
    attackerLosesDefense = true;
  }

  // Charge: +2 dice, attacker loses Defense (stacks with all-out: pick the
  // better of the two bonuses rather than double-adding; RAW they share the
  // "lose Defense" cost, so we cap the combined bonus at +2 if both are set).
  if (opts.charge) {
    if (!opts.allOut) {
      poolMod += 2;
    }
    attackerLosesDefense = true;
  }

  // Aim: 0-3 stacked bonus from prior aim action.
  if (opts.aim && opts.aim > 0) {
    poolMod += Math.min(3, opts.aim);
  }

  // Off-hand: -2.
  if (opts.offhand) {
    poolMod -= 2;
  }

  // Pulling blow: +1 to target's effective Defense, damage capped by max.
  if (opts.pulling) {
    targetDefenseMod += 1;
  }

  // Autofire. Multi-target bursts (med/long) take -1 per extra target.
  const extraTargets = Math.max(0, (opts.targets ?? 1) - 1);
  if (opts.burstShort) {
    poolMod += 1;
  } else if (opts.burstMed) {
    poolMod += 2 - extraTargets;
  } else if (opts.burstLong) {
    poolMod += 3 - extraTargets;
  }

  // Shooting into melee to avoid bystanders.
  if (opts.intoMelee) {
    poolMod += intoMeleePenalty(opts.intoMelee);
  }

  // Target concealment (shooter trying to hit a concealed target).
  if (opts.targetConcealment) {
    poolMod += concealmentPenalty(opts.targetConcealment);
  }

  // Attacker concealment (return-fire penalty).
  if (opts.concealment && opts.concealment > 1) {
    poolMod -= (opts.concealment - 1);
  }

  // Target prone: -2 to ranged attacks, +2 to melee.
  if (opts.targetProne) {
    const isRanged = opts.pool === "ranged";
    poolMod += isRanged ? -2 : 2;
  }

  // Specified target location.
  poolMod += specifiedPenalty(opts.specified);

  // Killer Instinct: +dots vs beaten-down / heavily-wounded targets.
  poolMod += killerInstinctBonus(
    attackerSheet,
    opts.targetSheet,
    opts.targetBeatenDown,
  );

  // Attacker wound penalty -- opt-in only. pools.ts already applies the
  // wound penalty for buildPool() callers, so this branch is intended for
  // out-of-band callers that bypass buildPool. Explicit value wins.
  let woundDice = 0;
  if (typeof opts.attackerWoundPenalty === "number") {
    woundDice = Math.max(0, Math.min(3, Math.floor(opts.attackerWoundPenalty)));
  } else if (opts.attackerSheet) {
    woundDice = Math.max(0, Math.min(3, sheetWoundPenalty(opts.attackerSheet)));
  }
  poolMod -= woundDice;

  return {
    poolMod,
    targetDefenseMod,
    coverMod,
    targetSurprised: opts.targetSurprised === true,
    attackerLosesDefense,
  };
}
