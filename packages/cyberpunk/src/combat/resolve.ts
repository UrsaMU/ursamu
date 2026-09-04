/**
 * CPR attack resolution helpers for @ursamu/combat ports.
 * Wraps engine math; does not own encounter lifecycle.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter, ICPRNpc, WoundState } from
  "../../db/schemas.ts";
import {
  applyDamageToChar,
  woundActionPenalty,
} from "../../engine/character.ts";
import {
  effectiveSP,
  resolveAttack,
} from "../../engine/combat.ts";
import { applyDamageToNpc } from "../../engine/npc.ts";
import { getWeapon } from "../../data/weapons.ts";

export function cprOf(actor: IDBObj): ICPRCharacter | null {
  // deno-lint-ignore no-explicit-any
  const c = (actor.state as any)?.cpr as ICPRCharacter | undefined;
  if (!c || typeof c !== "object") return null;
  return c;
}

export function npcOf(actor: IDBObj): ICPRNpc | null {
  // deno-lint-ignore no-explicit-any
  const n = (actor.state as any)?.cprNpc as ICPRNpc | undefined;
  if (!n || typeof n !== "object") return null;
  return n;
}

export function healthFrac(actor: IDBObj): number {
  const cpr = cprOf(actor);
  if (cpr) {
    const max = Math.max(1, cpr.hp?.max ?? 1);
    const cur = Math.max(0, cpr.hp?.current ?? 0);
    return Math.max(0, Math.min(1, cur / max));
  }
  const npc = npcOf(actor);
  if (npc) {
    const max = Math.max(1, npc.hp?.max ?? 1);
    const cur = Math.max(0, npc.hp?.current ?? 0);
    return Math.max(0, Math.min(1, cur / max));
  }
  return 1;
}

export function isIncapacitated(actor: IDBObj): boolean {
  const cpr = cprOf(actor);
  if (cpr) {
    const ws = cpr.woundState as WoundState;
    if (ws === "mortally" || ws === "dead") return true;
    return (cpr.hp?.current ?? 0) <= 0;
  }
  const npc = npcOf(actor);
  if (npc) {
    if (npc.woundState === "mortally" || npc.woundState === "dead") {
      return true;
    }
    return (npc.hp?.current ?? 0) <= 0;
  }
  return false;
}

export type CprAttackResult = {
  hit: boolean;
  damage: number;
  message: string;
  targetOut: boolean;
};

function defaultWeaponDice(actor: IDBObj): number {
  const npc = npcOf(actor);
  if (npc?.weapon?.damageDice) return npc.weapon.damageDice;
  const cpr = cprOf(actor);
  const gear = cpr?.gear ?? [];
  for (const g of gear) {
    const w = getWeapon(g.name) ?? getWeapon(g.id ?? "");
    if (w?.damageDice) return w.damageDice;
  }
  return 2;
}

function attackerParts(actor: IDBObj): {
  stat: number;
  skill: number;
} {
  const cpr = cprOf(actor);
  if (cpr) {
    const skill = cpr.skills?.handgun ??
      cpr.skills?.brawling ?? 0;
    const stat = cpr.stats?.ref ?? 5;
    const wound = woundActionPenalty(
      cpr.woundState,
      cpr.cyberware,
    );
    return { stat: stat + wound, skill };
  }
  const npc = npcOf(actor);
  if (npc) {
    const skName = npc.weapon?.skill || "handgun";
    const skill = npc.skills?.[skName] ??
      npc.skills?.handgun ??
      npc.skills?.brawling ?? 4;
    const melee = /melee|brawl/i.test(skName);
    const stat = melee
      ? (npc.stats?.dex ?? 5)
      : (npc.stats?.ref ?? 5);
    return { stat, skill };
  }
  return { stat: 5, skill: 0 };
}

function armorSpOf(target: IDBObj): number {
  const cpr = cprOf(target);
  if (cpr) return effectiveSP(cpr, "body", false);
  const npc = npcOf(target);
  if (npc) return npc.armorBody?.currentSp ?? 0;
  return 0;
}

/**
 * Resolve a basic body attack for ports / AI walker.
 * Persists HP via u.db.modify on hit.
 */
export async function executeCprAttack(
  u: IUrsamuSDK,
  attacker: IDBObj,
  target: IDBObj,
): Promise<CprAttackResult> {
  const nameA = attacker.name ?? attacker.id;
  const nameT = target.name ?? target.id;
  const parts = attackerParts(attacker);
  const sp = armorSpOf(target);
  const dice = defaultWeaponDice(attacker);

  const cprT = cprOf(target);
  const npcT = npcOf(target);

  let defenderDV = 15;
  if (cprT) {
    const wound = woundActionPenalty(
      cprT.woundState,
      cprT.cyberware,
    );
    defenderDV = (cprT.stats?.dex ?? 5) +
      (cprT.skills?.evasion ?? 0) + wound + 8;
  } else if (npcT) {
    defenderDV = (npcT.stats?.dex ?? 5) +
      (npcT.skills?.evasion ?? 2) + 8;
  }

  const resolved = resolveAttack({
    attackerStat: parts.stat,
    attackerSkill: parts.skill,
    defenderDV,
    damageDice: dice,
    location: "body",
  }, sp);

  const hitLine =
    `%ch${nameA}%cn attacks %ch${nameT}%cn: ` +
    `${resolved.attackTotal} vs DV ${resolved.defenseTotal}`;

  if (!resolved.hit) {
    return {
      hit: false,
      damage: 0,
      message: `${hitLine} — %chmiss%cn.`,
      targetOut: false,
    };
  }

  let targetOut = false;
  let message =
    `${hitLine} — %chhit%cn for %ch${resolved.netDamage}%cn ` +
    `(raw ${resolved.rawDamage}, SP ${sp}).`;

  if (cprT) {
    const { char: next } = applyDamageToChar(
      cprT,
      resolved.netDamage,
    );
    await u.db.modify(target.id, "$set", { "state.cpr": next });
    // deno-lint-ignore no-explicit-any
    if (target.state) (target.state as any).cpr = next;
    targetOut = next.woundState === "mortally" ||
      next.woundState === "dead" ||
      next.hp.current <= 0;
    message +=
      ` HP ${next.hp.current}/${next.hp.max}` +
      ` (${next.woundState}).`;
  } else if (npcT) {
    const { npc: next } = applyDamageToNpc(
      npcT,
      resolved.netDamage,
    );
    await u.db.modify(target.id, "$set", {
      "state.cprNpc": next,
    });
    // deno-lint-ignore no-explicit-any
    if (target.state) (target.state as any).cprNpc = next;
    targetOut = next.woundState === "mortally" ||
      next.woundState === "dead" ||
      next.hp.current <= 0;
    message +=
      ` HP ${next.hp.current}/${next.hp.max}` +
      ` (${next.woundState}).`;
  }

  return {
    hit: true,
    damage: resolved.netDamage,
    message,
    targetOut,
  };
}
