// core/defense.ts -- Reactive defense (dodge / block / parry) for combat.
//
// Per W20 (p. 288): a character who doesn't want to get hit must DECLARE
// one of three defensive actions before the attacker rolls, and the
// declaration COSTS an action that turn. Aborting a planned action to
// substitute a defense requires a Willpower roll (or 1 WP). There is no
// reflexive / passive defense -- undeclared = unopposed.
//
// Implementation: defense fires only when `pendingDefense` is set via
// `+defend`. The declared defense rolls at full pool minus any split
// penalty from `+split`. Cleared after one consumption (in resolveAttack).
//
// Pool sources (W20 canon):
//   dodge  = Dex + Athletics
//   block  = Dex + Brawl    (Brawl/Melee attacks only)
//   parry  = Dex + Melee    (Brawl/Melee attacks only; need wielded melee)
//
// Pure: no I/O, no persistence. Caller clears pendingDefense if consumed.

import type { IWoDChar } from "./types.ts";
import { rollDice, DEFAULT_DIFFICULTY, type IDiceRoll } from "./dice.ts";
import { woundPenalty } from "./wounds.ts";
// deno-lint-ignore no-explicit-any
type AnyObj = any;

export type DefenseKind = "dodge" | "block" | "parry";

export type AttackAbility = "Brawl" | "Melee" | "Firearms";

export interface IDefenseRollOptions {
  /** Injectable for deterministic tests. */
  roller?: typeof rollDice;
  /**
   * Holder for parry: only relevant when kind === "parry". If a wielded
   * weapon is required, pass the defender's IDBObj (with contents). When
   * omitted, parry falls back to bare-hands which canon disallows
   * (legalDefenses() filters this).
   */
  // deno-lint-ignore no-explicit-any
  defenderHolder?: AnyObj;
  /**
   * Stacking dice penalty to apply ONLY when the defender's declared
   * defense fires (from their own +split). Auto-half fallback never
   * pays this penalty -- passive evasion is free.
   */
  declaredPenalty?: number;
}

export interface IDefenseRoll {
  kind: DefenseKind;
  pool: number;
  roll: IDiceRoll;
}

function attr(char: IWoDChar, name: string): number {
  return 1 + (char.attributes[name] ?? 0);
}

function ability(char: IWoDChar, name: string): number {
  return char.abilities[name] ?? 0;
}

/** Has the defender a wielded melee weapon? Needed for /parry legality. */
function hasWieldedMelee(holder: AnyObj | undefined): boolean {
  if (!holder?.contents || !Array.isArray(holder.contents)) return false;
  return holder.contents.some((it: AnyObj) => {
    const s = it?.state ?? {};
    const attrs: Array<{ name?: string; value?: unknown }> = Array.isArray(s.attributes) ? s.attributes : [];
    const kind = s.kind ?? attrs.find((a) => (a.name ?? "").toUpperCase() === "KIND")?.value;
    const wt   = s.weaponType ?? attrs.find((a) => (a.name ?? "").toUpperCase() === "WEAPONTYPE")?.value;
    return kind === "weapon" && wt === "melee" && s.wielded === true;
  });
}

/**
 * Which defenses are legal vs an attack with the given ability?
 *  - Dodge: always legal.
 *  - Block: only vs Brawl/Melee.
 *  - Parry: only vs Brawl/Melee AND defender must be wielding a melee weapon.
 */
export function legalDefenses(
  attackAbility: AttackAbility,
  defenderHolder?: AnyObj,
): DefenseKind[] {
  const legal: DefenseKind[] = ["dodge"];
  if (attackAbility === "Brawl" || attackAbility === "Melee") {
    legal.push("block");
    if (hasWieldedMelee(defenderHolder)) legal.push("parry");
  }
  return legal;
}

/** Canon pool for a defense kind (Dex + ability), before wound/split penalty. */
function basePoolFor(defender: IWoDChar, kind: DefenseKind): number {
  const dex = attr(defender, "Dexterity");
  switch (kind) {
    // W20 p.288: dodge = Dex + Athletics.
    case "dodge": return dex + ability(defender, "Athletics");
    case "block": return dex + ability(defender, "Brawl");
    case "parry": return dex + ability(defender, "Melee");
  }
}

/** Pool for a declared defense roll, applying wound penalty. Min 1. */
export function defensePool(defender: IWoDChar, kind: DefenseKind): number {
  return Math.max(1, basePoolFor(defender, kind) - woundPenalty(defender));
}

/**
 * Resolve the defender's declared defense. Returns undefined when no
 * defense is declared (canon: undeclared = unopposed). A declared
 * defense illegal vs this attack (e.g. /block vs firearms) is also
 * skipped -- it stays queued for a legal attack.
 */
export function resolveDefense(
  defender: IWoDChar,
  attackAbility: AttackAbility,
  opts: IDefenseRollOptions = {},
): IDefenseRoll | undefined {
  const declared = defender.pendingDefense;
  if (!declared) return undefined;
  const legal = legalDefenses(attackAbility, opts.defenderHolder);
  if (!legal.includes(declared.kind)) return undefined;

  const roll = opts.roller ?? rollDice;
  const basePool = defensePool(defender, declared.kind);
  const penalty = Math.max(0, opts.declaredPenalty ?? 0);
  const pool = Math.max(1, basePool - penalty);
  const dRoll = roll(pool, DEFAULT_DIFFICULTY, false);
  return { kind: declared.kind, pool, roll: dRoll };
}

/** Discard pendingDefense from the defender (mutates). */
export function consumePendingDefense(defender: IWoDChar): void {
  defender.pendingDefense = undefined;
}
