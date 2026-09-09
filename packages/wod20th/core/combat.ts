// core/combat.ts -- WoD20th basic combat resolution (v1).
//
// Single-roll attack resolution: attack pool vs difficulty 6, optional defense
// roll, damage roll, soak roll, then apply net successes - soaked as damage.
//
// V1 simplifications:
//   - No defense roll by default (callers may pass opts.surprise=false but
//     v1 always skips the defender's Dodge -- a future patch adds it).
//   - Wound penalty: imported from ../core/wounds.ts if present, else stubbed
//     to 0 (the helper is landing in a parallel agent's work).
//   - Soak: defender's Stamina only. Garou form bonuses are deferred.
//   - Aggravated damage is never soakable; Lethal is soakable by anyone in v1
//     (a future patch restricts to Garou + supernaturals).
//   - Damage type fixed by caller (default Bashing).
//
// Pure logic -- no DB writes. Caller persists via saveChar.

import type { IWoDChar } from "./types.ts";
import { rollDice, type IDiceRoll, DEFAULT_DIFFICULTY } from "./dice.ts";
import { woundPenalty } from "./wounds.ts";
import {
  consumePendingDefense,
  resolveDefense,
  type AttackAbility,
  type IDefenseRoll,
} from "./defense.ts";
import { splitPenalty } from "./actions.ts";

export interface IAttackOptions {
  /** Attack ability: "Brawl" | "Melee" | "Firearms". Default "Brawl". */
  abilityName?: string;
  /** Damage type applied. Default "B" (bashing). */
  damageType?: "B" | "L" | "A";
  /** Bonus damage dice (weapon). Default 0. */
  weaponBonus?: number;
  /** True = defender doesn't soak (sleeping). V1 still rolls soak; reserved. */
  surprise?: boolean;
  /** Injectable roller for deterministic tests. */
  roller?: typeof rollDice;
  /**
   * Defender's IDBObj (with contents). Required for /parry legality.
   * When omitted, parry is unavailable and the defender falls back to
   * dodge or block.
   */
  // deno-lint-ignore no-explicit-any
  defenderHolder?: any;
  /**
   * Skip defense resolution entirely (e.g. unconscious target, surprise
   * round). Defaults false.
   */
  noDefense?: boolean;
  /**
   * Stacking dice penalty applied to the attacker's attack pool (from
   * pool-splitting / +split). Defender's own split penalty is read from
   * `defender.actionDecl` when defense is declared. Default 0.
   */
  attackerPenalty?: number;
}

export interface IAttackResult {
  attackRoll:       IDiceRoll;
  defense?:         IDefenseRoll;
  damageRoll?:      IDiceRoll;
  soakRoll?:        IDiceRoll;
  netSuccesses:     number;
  soakedSuccesses:  number;
  finalDamage:      number;
  damageType:       "B" | "L" | "A";
  message:          string;
}

/** Look up an attribute dot count (base 1 + extra dots stored in attributes map). */
function attr(char: IWoDChar, name: string): number {
  return 1 + (char.attributes[name] ?? 0);
}

/** Look up an ability rating (base 0). */
function ability(char: IWoDChar, name: string): number {
  return char.abilities[name] ?? 0;
}

/**
 * Resolve a complete attack from `attacker` against `defender`.
 * Pure: no I/O, no persistence. Caller must apply damage + save.
 */
export function resolveAttack(
  attacker: IWoDChar,
  defender: IWoDChar,
  opts: IAttackOptions = {},
): IAttackResult {
  const roll        = opts.roller ?? rollDice;
  const abilityName = opts.abilityName ?? "Brawl";
  // VtM Feral Claws (Protean 2): unarmed Brawl deals aggravated (+1).
  const claws       = abilityName === "Brawl" && attacker.feralWeapons === true;
  const damageType  = opts.damageType  ?? (claws ? "A" : "B");
  const weaponBonus = Math.max(0, (opts.weaponBonus ?? 0) + (claws ? 1 : 0));

  // Attack roll: Dex + <ability>, less wound penalty AND split penalty.
  const wpAtt        = woundPenalty(attacker);
  const splitPenAtt  = Math.max(0, opts.attackerPenalty ?? 0);
  const attackPool   = Math.max(1, attr(attacker, "Dexterity") + ability(attacker, abilityName) - wpAtt - splitPenAtt);
  const attackRoll   = roll(attackPool, DEFAULT_DIFFICULTY, false);

  // Botch -> miss outright (no damage, no soak).
  if (attackRoll.botch) {
    return {
      attackRoll,
      netSuccesses:    0,
      soakedSuccesses: 0,
      finalDamage:     0,
      damageType,
      message: "Botched attack -- the strike goes wild.",
    };
  }

  // Defense: only fires when the defender DECLARED one via +defend.
  // W20 p.288: undeclared = unopposed; auto-rolls are not canon.
  let defense: IDefenseRoll | undefined;
  if (!opts.noDefense) {
    defense = resolveDefense(defender, abilityName as AttackAbility, {
      roller: roll,
      defenderHolder: opts.defenderHolder,
      declaredPenalty: splitPenalty(defender),
    });
    // Declared defenses cost the defender's action; consume them.
    if (defense) consumePendingDefense(defender);
  }

  const defNet = defense ? Math.max(0, defense.roll.netSuccesses) : 0;
  const netSuccesses = Math.max(0, attackRoll.netSuccesses - defNet);
  if (netSuccesses <= 0) {
    return {
      attackRoll,
      defense,
      netSuccesses:    0,
      soakedSuccesses: 0,
      finalDamage:     0,
      damageType,
      message: defense
        ? `Attack turned aside (${defense.kind}: ${defNet} success${defNet === 1 ? "" : "es"}).`
        : "Attack fails to connect.",
    };
  }

  // Damage roll: Strength + weaponBonus + netSuccesses dice, difficulty 6.
  const damagePool  = Math.max(1, attr(attacker, "Strength") + weaponBonus + netSuccesses);
  const damageRoll  = roll(damagePool, DEFAULT_DIFFICULTY, false);
  const damageHits  = damageRoll.netSuccesses;

  // Soak roll (skipped for Aggravated -- never soakable).
  let soakRoll: IDiceRoll | undefined;
  let soaked = 0;
  if (damageType !== "A") {
    const wpDef    = woundPenalty(defender);
    const soakPool = Math.max(1, attr(defender, "Stamina") - wpDef);
    soakRoll = roll(soakPool, DEFAULT_DIFFICULTY, false);
    soaked   = soakRoll.netSuccesses;
  }

  const finalDamage = Math.max(0, damageHits - soaked);

  const message = finalDamage > 0
    ? `Strike lands: ${finalDamage} ${damageType} damage (${damageHits} raw, ${soaked} soaked).`
    : `Strike lands but is soaked entirely (${damageHits} raw, ${soaked} soaked).`;

  return {
    attackRoll,
    defense,
    damageRoll,
    soakRoll,
    netSuccesses,
    soakedSuccesses: soaked,
    finalDamage,
    damageType,
    message,
  };
}
