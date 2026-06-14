import { gameHooks } from "@ursamu/ursamu";
import type { IMektonChar, IMektonWounds, WoundLocation } from "./schema.ts";
import { derivedStats } from "./derived.ts";
import { rollInterlock, rollDamage } from "./roll.ts";
import type { IEquipmentItem } from "./schema.ts";

export const HIT_LOCATIONS: WoundLocation[] = [
  "head", "torso", "torso", "torso", "rArm", "rArm", "lArm", "rLeg", "rLeg", "lLeg",
];
// index 0 = roll 1, index 9 = roll 10

export const LOCATION_LABELS: Record<WoundLocation, string> = {
  head:  "Head",
  torso: "Torso",
  rArm:  "Right Arm",
  lArm:  "Left Arm",
  rLeg:  "Right Leg",
  lLeg:  "Left Leg",
};

export interface ICombatEvent {
  roomId: string;
  attackerId: string;
  attackerName: string;
  targetId: string;
  targetName: string;
  weapon: string;
  attackRoll: number;
  defenceRoll: number;
  hit: boolean;
  location?: string;
  rawDamage?: number;
  armorSP?: number;
  appliedDamage?: number;
  stunCheck?: boolean;
  summary: string;
}

/** Roll 1D10 for hit location (1-indexed → array index). */
function rollLocation(): WoundLocation {
  return HIT_LOCATIONS[Math.floor(Math.random() * 10)];
}

/** Get the highest armor SP for a given location. */
function armorSP(char: IMektonChar, location: WoundLocation): number {
  const label = LOCATION_LABELS[location];
  let best = 0;
  for (const item of char.equipment) {
    if (!item.sp) continue;
    if (item.location === "All" || item.location === label || item.location === "Single") {
      best = Math.max(best, item.sp);
    }
  }
  return best;
}

/** Apply damage to a specific location; clamp to 0. Returns actual damage applied. */
export function applyDamage(
  wounds: IMektonWounds,
  location: WoundLocation,
  hits: number,
): number {
  const applied = Math.min(wounds[location], Math.max(0, hits));
  wounds[location] = wounds[location] - applied;
  return applied;
}

/** Describe combat status for a character. */
export function combatStatus(char: IMektonChar): string {
  if (char.wounds.head <= 0) return "DEAD";
  if (char.wounds.torso <= 0) return "INCAPACITATED";
  const parts: string[] = [];
  for (const loc of Object.keys(char.wounds) as WoundLocation[]) {
    if (char.wounds[loc] <= 0) parts.push(`${LOCATION_LABELS[loc]} DISABLED`);
  }
  if (char.stunned) parts.push("STUNNED");
  if (parts.length === 0) {
    const worst = Math.min(...Object.values(char.wounds));
    if (worst >= 6) return "Uninjured";
    if (worst >= 4) return "Lightly Wounded";
    if (worst >= 2) return "Wounded";
    return "Badly Wounded";
  }
  return parts.join(", ");
}

/**
 * Resolve a full attack between attacker and defender.
 * Returns the combat event payload (caller emits it).
 */
export function resolveAttack(
  attacker: IMektonChar,
  defender: IMektonChar,
  weapon: IEquipmentItem,
  attackSkillLevel: number,
): ICombatEvent {
  const wa = weapon.wa ?? 0;
  const atkRoll = rollInterlock(attacker.stats.ref, attackSkillLevel);
  const defRoll = rollInterlock(defender.stats.ref, defender.skills["Dodge & Escape"] ?? 0);
  const attackTotal = atkRoll.total + wa;
  const hit = attackTotal > defRoll.total;

  const event: ICombatEvent = {
    roomId: "",
    attackerId: attacker.id,
    attackerName: attacker.playerName,
    targetId: defender.id,
    targetName: defender.playerName,
    weapon: weapon.name,
    attackRoll: attackTotal,
    defenceRoll: defRoll.total,
    hit,
    summary: "",
  };

  if (!hit) {
    event.summary = `${attacker.playerName} attacks ${defender.playerName} with ${weapon.name} — MISS (${attackTotal} vs ${defRoll.total}).`;
    return event;
  }

  const location = rollLocation();
  const rawDmg = weapon.damage ? rollDamage(weapon.damage.replace(/\[AP\]/, "")) : 0;
  const sp = armorSP(defender, location);
  const applied = Math.max(0, rawDmg - sp);

  event.location = LOCATION_LABELS[location];
  event.rawDamage = rawDmg;
  event.armorSP = sp;
  event.appliedDamage = applied;
  event.stunCheck = applied > 0;

  const derived = derivedStats(defender);
  const stunRoll = Math.ceil(Math.random() * 10);
  const stunned = applied > 0 && stunRoll > derived.stun;

  event.summary = [
    `${attacker.playerName} attacks ${defender.playerName} with ${weapon.name}:`,
    `Attack ${attackTotal} vs Defence ${defRoll.total} — HIT (${LOCATION_LABELS[location]}).`,
    `Damage: ${rawDmg} raw - ${sp} SP = ${applied} applied.`,
    stunned ? `${defender.playerName} is STUNNED!` : "",
  ].filter(Boolean).join(" ");

  return event;
}

export function emitCombatEvent(payload: ICombatEvent): void {
  (gameHooks.emit as (e: string, p: unknown) => void)("mekton:combat", payload);
}
