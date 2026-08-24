/**
 * Cyberpunk RED -- Netrunning Logic
 * Interface ability checks, ICE resolution, architecture traversal.
 */
import { rollD10Critical, skillCheck } from "./dice.ts";
import { rollDamage } from "./dice.ts";
import type { INetFloor, INetrun, ICPRCharacter, WoundState } from "../db/schemas.ts";
import { INTERFACE_ABILITIES, PROGRAMS, type InterfaceAbilityName } from "../data/programs.ts";
import { netActionsPerTurn } from "../data/roles.ts";
import { applyDamageToChar } from "./character.ts";

// -- Interface Ability Resolution ----------------------------------------------

export interface IInterfaceResult {
  ability: InterfaceAbilityName;
  roll: number;
  total: number;
  dv: number;
  success: boolean;
  effect: string;
}

/**
 * Resolve an Interface Ability check.
 * Roll: INT + Interface Rank + 1d10 vs floor DV.
 */
export const resolveInterfaceAbility = (
  char: ICPRCharacter,
  ability: InterfaceAbilityName,
  floorDV: number,
  luckSpend = 0
): IInterfaceResult => {
  const interfaceSkill = char.skills["interface"] ?? 0;
  const { base, total: rollD10 } = rollD10Critical();
  const total = char.stats.int + interfaceSkill + rollD10 + luckSpend;
  const success = total >= floorDV;

  const effects: Record<InterfaceAbilityName, string> = {
    backdoor: success ? "Bypassed the password/obstruction." : "Failed to bypass. ICE alerted.",
    cloak: success ? "Actions hidden. Cloak active until next attack." : "Cloak failed. Presence detected.",
    control: success ? "Took control of hardware attached to Architecture." : "Control failed.",
    eye_dee: success ? "Identified data: type and Eurodollar value revealed." : "Could not identify data.",
    pathfinder: success ? "Learned Architecture layout: floor count and types." : "Could not map Architecture.",
    scanner: success ? "Located all connected systems in the area." : "Scanner blocked.",
    slide: success ? "Slipped away from one pursuing Black ICE." : "Could not escape ICE pursuit.",
    virus: success ? "Virus planted at Architecture core." : "Virus install failed.",
    zap: success ? "Zap attack connected." : "Zap missed.",
  };

  return {
    ability,
    roll: base,
    total,
    dv: floorDV,
    success,
    effect: effects[ability],
  };
};

// -- NET Actions Per Turn ------------------------------------------------------

/** How many NET actions this character gets per turn. */
export const getNetActionsPerTurn = (char: ICPRCharacter): number =>
  netActionsPerTurn(char.roleRank);

// -- ICE Attack Resolution -----------------------------------------------------

export interface IIceAttackResult {
  iceName: string;
  iceAtk: number;
  defenseTotal: number;
  hit: boolean;
  damage: number;
  netDamage: number;  // after program defense
}

/**
 * Resolve ICE attacking a Netrunner.
 * ICE ATK vs (INT + Interface + 1d10) for defense.
 * On hit: ICE.atk becomes damage (applied to Netrunner's body HP).
 */
export const resolveIceAttack = (
  char: ICPRCharacter,
  iceName: string,
  iceAtk: number,
  defenseProgramDef = 0
): IIceAttackResult => {
  const interfaceSkill = char.skills["interface"] ?? 0;
  const { total: defRoll } = rollD10Critical();
  const defenseTotal = char.stats.int + interfaceSkill + defRoll;

  const hit = iceAtk > defenseTotal;
  const rawDamage = hit ? iceAtk : 0;
  const netDamage = hit ? Math.max(0, rawDamage - defenseProgramDef) : 0;

  return { iceName, iceAtk, defenseTotal, hit, damage: rawDamage, netDamage };
};

// -- Brain Damage Application -------------------------------------------------
//
// CPR Core errata p.204: "Brain damage is applied directly to HP and is not
// affected by worn or implanted armor. It cannot cause a Critical Injury."
//
// This is the ONLY supported path for applying damage from Black ICE or any
// other hostile NET source. Callers MUST route ICE / NET damage through here
// rather than the standard combat damage path so that:
//   - Worn body/head armor SP is NOT subtracted (bypassArmor)
//   - Subdermal armor / skin weave is NOT subtracted (bypassArmor)
//   - No critical injury roll is triggered (bypassCrit)
//   - Wound state / Seriously Wounded / Mortally Wounded thresholds and death
//     saves all apply normally (it is still HP damage).
//
// Program-based defenses (e.g. Armor, Shield) reduce the incoming damage value
// BEFORE it reaches this function — they are NOT worn armor.
//
// Handoff note for combat-engine agent: when a shared damage pipeline lands in
// engine/combat.ts, it should accept `{ bypassArmor, bypassCrit }` flags and
// this helper should be re-expressed in terms of that pipeline.

export interface IBrainDamageResult {
  amount: number;
  newHp: number;
  newWoundState: WoundState;
  char: ICPRCharacter;
  bypassedArmor: true;
  critInjuryRolled: false;
}

/**
 * Apply Black ICE / NET brain damage directly to a netrunner's HP.
 * Bypasses worn and implanted armor. Cannot cause a Critical Injury.
 * Wound state transitions and death-save thresholds apply normally.
 */
export const applyBrainDamage = (
  char: ICPRCharacter,
  amount: number,
): IBrainDamageResult => {
  const dmg = Math.max(0, Math.floor(amount));
  const { char: updated, newHp, newWoundState } = applyDamageToChar(char, dmg);
  return {
    amount: dmg,
    newHp,
    newWoundState,
    char: updated,
    bypassedArmor: true,
    critInjuryRolled: false,
  };
};

// -- Architecture Traversal ----------------------------------------------------

/**
 * Get the current floor for a netrunner in a netrun session.
 */
export const getCurrentFloor = (netrun: INetrun, runnerId: string): number =>
  netrun.currentFloor[runnerId] ?? 0;

/**
 * Advance a netrunner to the next floor (if current floor is bypassed).
 */
export const advanceFloor = (
  netrun: INetrun,
  runnerId: string
): INetrun => ({
  ...netrun,
  currentFloor: {
    ...netrun.currentFloor,
    [runnerId]: (netrun.currentFloor[runnerId] ?? 0) + 1,
  },
});

/**
 * Get the floor definition at a given index.
 */
export const getFloor = (
  floors: INetFloor[],
  index: number
): INetFloor | null => floors[index] ?? null;

// -- Program ATK vs ICE REZ ----------------------------------------------------

export interface IProgramAttackResult {
  programName: string;
  roll: number;
  total: number;
  iceRez: number;
  hit: boolean;
  damage: number;
  iceDestroyed: boolean;
}

/**
 * Netrunner uses an attack program against ICE.
 * Roll: INT + Interface + 1d10 + Program ATK vs ICE REZ (as HP pool).
 */
export const resolveProgramAttack = (
  char: ICPRCharacter,
  programName: string,
  programAtk: number,
  iceCurrentRez: number
): IProgramAttackResult => {
  const interfaceSkill = char.skills["interface"] ?? 0;
  const { base, total: rollD10 } = rollD10Critical();
  const total = char.stats.int + interfaceSkill + rollD10;
  const hit = total > 0; // programs always attempt; ATK is added to damage not attack
  const damage = hit ? programAtk : 0;
  const remaining = iceCurrentRez - damage;

  return {
    programName,
    roll: base,
    total,
    iceRez: iceCurrentRez,
    hit,
    damage,
    iceDestroyed: remaining <= 0,
  };
};

// -- Turn Budget ---------------------------------------------------------------

/**
 * Check whether a runner has NET actions remaining this turn.
 * Returns true if at least one action is available.
 */
export const hasNetActionsRemaining = (
  netrun: INetrun,
  char: ICPRCharacter,
): boolean => {
  const cap = getNetActionsPerTurn(char);
  const used = netrun.actionsUsedThisTurn ?? 0;
  return used < cap;
};

/**
 * Return a new INetrun with actionsUsedThisTurn incremented by 1.
 */
export const consumeNetAction = (netrun: INetrun): INetrun => ({
  ...netrun,
  actionsUsedThisTurn: (netrun.actionsUsedThisTurn ?? 0) + 1,
});

/**
 * Return a new INetrun with actionsUsedThisTurn reset to 0 (start of new turn).
 */
export const resetNetTurn = (netrun: INetrun): INetrun => ({
  ...netrun,
  actionsUsedThisTurn: 0,
});

// -- Session Log ---------------------------------------------------------------

export const appendNetLog = (netrun: INetrun, entry: string): INetrun => ({
  ...netrun,
  log: [...netrun.log, `[${new Date().toISOString()}] ${entry}`],
});

// -- Architecture Builder ------------------------------------------------------

import type { INetArchitecture } from "../db/schemas.ts";

/** Create a minimal NET architecture with passwords only. */
export const buildSimpleArchitecture = (
  name: string,
  ownerId: string,
  roomId: string,
  floors: number,
  floorDV: number
): INetArchitecture => ({
  id: crypto.randomUUID(),
  name,
  ownerId,
  roomId,
  totalFloors: floors,
  portable: floors <= 6,
  maxControlNodes: floors <= 6 ? 2 : floors <= 12 ? 3 : 0,
  costPerFloor: floors <= 6 ? 1000 : floors <= 12 ? 5000 : 10000,
  floors: Array.from({ length: floors }, (_, i) => ({
    level: i + 1,
    type: "password" as const,
    name: `Password ${i + 1}`,
    dv: floorDV,
    bypassed: false,
  })),
});
