/**
 * Minimal D&D 5e attack/damage for combat ports proof.
 * Not a full SRD engine — enough to drive the walker.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  getAbilityMod,
  getProficiencyBonus,
  migrateSheet,
  type DndSheet,
} from "../stats/dnd_sheet.ts";
import type { Participant } from "@ursamu/combat";

function d20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

function rollDice(n: number, sides: number): number {
  let t = 0;
  for (let i = 0; i < n; i++) {
    t += Math.floor(Math.random() * sides) + 1;
  }
  return t;
}

export function sheetOf(actor: IDBObj): DndSheet {
  // deno-lint-ignore no-explicit-any
  return migrateSheet((actor.state as any)?.dnd);
}

export function healthFrac(sheet: DndSheet): number {
  const max = Math.max(1, sheet.hp?.max ?? 1);
  const cur = Math.max(0, sheet.hp?.current ?? 0);
  return Math.max(0, Math.min(1, cur / max));
}

export function isIncapacitated(sheet: DndSheet): boolean {
  return (sheet.hp?.current ?? 0) <= 0;
}

/** d20 + ability + prof vs AC; on hit 1d8 + ability. */
export async function executeDndAttack(
  u: IUrsamuSDK,
  attacker: IDBObj,
  target: IDBObj,
  targetSlot: Participant,
): Promise<{ hit: boolean; damage: number; message: string }> {
  const atk = sheetOf(attacker);
  const def = sheetOf(target);
  const str = getAbilityMod(atk.abilities.strength ?? 10);
  const dex = getAbilityMod(atk.abilities.dexterity ?? 10);
  const abil = Math.max(str, dex);
  const prof = getProficiencyBonus(atk.level ?? 1);
  const roll = d20();
  const toHit = roll + abil + prof;
  const ac = def.ac ?? 10;
  const nameA = attacker.name ?? attacker.id;
  const nameT = targetSlot.name || target.name || target.id;

  if (roll === 1 || (roll !== 20 && toHit < ac)) {
    const message =
      `%ch%ccD&D>>%cn ${nameA} attacks ${nameT}: ` +
      `d20(${roll})+${abil + prof}=${toHit} vs AC ${ac} — miss.`;
    return { hit: false, damage: 0, message };
  }

  const dmgRoll = rollDice(1, 8);
  const damage = Math.max(1, dmgRoll + abil);
  const hp = { ...def.hp, current: (def.hp?.current ?? 0) - damage };
  const next = { ...def, hp };
  await u.db.modify(target.id, "$set", { "data.dnd": next });
  // Keep in-memory actor fresh for subsequent sync.
  // deno-lint-ignore no-explicit-any
  (target.state as any).dnd = next;

  const crit = roll === 20 ? " (crit)" : "";
  const message =
    `%ch%ccD&D>>%cn ${nameA} hits ${nameT}${crit}: ` +
    `d20(${roll})+${abil + prof}=${toHit} vs AC ${ac}, ` +
    `${damage} damage (${hp.current}/${hp.max} HP).`;
  return { hit: true, damage, message };
}

export async function applyFleeOut(
  _u: IUrsamuSDK,
  _actor: IDBObj,
): Promise<void> {
  // isOut is set on the encounter participant by the walker.
}
