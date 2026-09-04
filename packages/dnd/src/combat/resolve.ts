/**
 * Minimal D&D 5e attack/damage for combat ports.
 * Uses applyDamage so death saves / massive death fire.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import {
  getAbilityMod,
  getProficiencyBonus,
  migrateSheet,
  type DndSheet,
} from "../stats/dnd_sheet.ts";
import { applyDamage, isDead } from "../stats/vitality.ts";
import { maybeProcessPlayerDeath } from
  "../stats/player-death.ts";
import {
  pickAttack,
  rollDamageFormula,
} from "./npc-attacks.ts";
import type { Participant } from "@ursamu/combat";

function d20(): number {
  return Math.floor(Math.random() * 20) + 1;
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
  return (sheet.hp?.current ?? 0) <= 0 || isDead(sheet);
}

/** Effective AC for attack/spell targeting (sheet field). */
export async function computeAc(
  _u: IUrsamuSDK,
  target: IDBObj,
): Promise<number> {
  const sheet = sheetOf(target);
  return Math.max(1, Number(sheet.ac) || 10);
}

export type AttackResult = {
  hit: boolean;
  damage: number;
  message: string;
  /** Target became permanently dead (not just 0 HP). */
  killed?: boolean;
  sheet?: DndSheet;
};

export type AttackOpts = {
  /** NPC sheet attack id (Bite, Scimitar, …). */
  abilityId?: string;
};

/** d20 + ability + prof vs AC; on hit damage via applyDamage. */
export async function executeDndAttack(
  u: IUrsamuSDK,
  attacker: IDBObj,
  target: IDBObj,
  targetSlot: Participant,
  opts: AttackOpts = {},
): Promise<AttackResult> {
  const atk = sheetOf(attacker);
  const def = sheetOf(target);
  const attack = pickAttack(atk, opts.abilityId);
  const str = getAbilityMod(atk.abilities.strength ?? 10);
  const dex = getAbilityMod(atk.abilities.dexterity ?? 10);
  const abil = attack.finesse ? Math.max(str, dex) : (
    attack.ranged ? dex : str
  );
  const prof = getProficiencyBonus(atk.level ?? 1);
  const roll = d20();
  const toHit = roll + abil + prof;
  const ac = def.ac ?? 10;
  const nameA = attacker.name ?? attacker.id;
  const nameT = targetSlot.name || target.name || target.id;
  const wpn = attack.name;

  if (roll === 1 || (roll !== 20 && toHit < ac)) {
    const message =
      `%ch${nameA}%cn attacks %ch${nameT}%cn with ` +
      `%ch${wpn}%cn: d20(${roll})+${abil + prof}=${toHit} ` +
      `vs AC ${ac} — %chmiss%cn.`;
    return { hit: false, damage: 0, message };
  }

  const { total: baseDmg, detail } = rollDamageFormula(
    attack.damage,
  );
  const damage = Math.max(1, baseDmg + abil);
  const crit = roll === 20;
  const dmg = applyDamage(def, damage, { critical: crit });
  let next = dmg.sheet;
  let message =
    `%ch${nameA}%cn %chhits%cn %ch${nameT}%cn with ` +
    `%ch${wpn}%cn${crit ? " (%chcrit%cn)" : ""}: ` +
    `d20(${roll})+${abil + prof}=${toHit} vs AC ${ac}, ` +
    `${detail}+${abil}=%ch${damage}%cn ${attack.damageType} ` +
    `(${next.hp.current}/${next.hp.max} HP).`;
  for (const ln of dmg.lines) {
    message += `\n${ln}`;
  }

  await u.db.modify(target.id, "$set", { "data.dnd": next });
  // deno-lint-ignore no-explicit-any
  if (target.state) (target.state as any).dnd = next;

  let killed = false;
  // Only PCs travel to the underworld (never monsters/NPCs).
  const isPlayer = target.flags?.has?.("player") === true;
  if (isDead(next) && isPlayer) {
    const death = await maybeProcessPlayerDeath(
      u,
      target,
      next,
      { quiet: true },
    );
    next = death.sheet;
    if (death.processed) {
      killed = true;
      for (const ln of death.lines) message += `\n${ln}`;
      // Room broadcast for death (spirit already messaged quietly)
      const roomMsg =
        `%ch%cr${nameT}%cn dies! A corpse remains.`;
      if (typeof u.broadcast === "function") {
        u.broadcast(roomMsg);
      }
      message += `\n${roomMsg}`;
    }
  }

  return {
    hit: true,
    damage,
    message,
    killed,
    sheet: next,
  };
}

export async function applyFleeOut(
  _u: IUrsamuSDK,
  _actor: IDBObj,
): Promise<void> {
  // isOut is set on the encounter participant by the walker.
}
