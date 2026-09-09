// core/npc.ts -- Wyrm NPC spawn helper + AI turn driver.
//
// NPCs are IWoDChar records with isNpc=true and a synthetic playerId
// of the form "npc-<uuid>". A matching IDBObj is created in the room
// so +attack and target resolution work unchanged.

import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import { createChar, findByPlayer, saveChar, unsetCharFields } from "../db/charDb.ts";
import type { IWoDChar } from "./types.ts";
import { applyDamage } from "./health.ts";
import { isIncapacitated } from "./wounds.ts";
import { awardXp } from "./xp.ts";
import { createXpEntry } from "../db/xpDb.ts";
import { resolveAttack } from "./combat.ts";
import { rollDice } from "./dice.ts";
import { defensePool, consumePendingDefense } from "./defense.ts";
import type { DamageType } from "./eq.ts";
import { poseRoom } from "./poseRoom.ts";
import {
  getNpcTemplate,
  type IWyrmNpcDef,
} from "../splats/wta/data/wyrmNpcs.ts";
import { maybeAwardTitles, type ITitleAward } from "./titles.ts";

// deno-lint-ignore no-explicit-any
type AnyObj = any;

export interface ISpawnedNpc {
  /** Synthetic playerId for the NPC, also the IDBObj id. */
  npcId: string;
  /** IWoDChar record id. */
  charId: string;
  /** Template slug. */
  templateSlug: string;
}

/**
 * Spawn an NPC from a bestiary template into the actor's current room.
 * Returns the new ids, or null on bad template.
 */
export async function spawnNpc(
  u: IUrsamuSDK,
  templateSlug: string,
  customName?: string,
): Promise<ISpawnedNpc | null> {
  const def = getNpcTemplate(templateSlug);
  if (!def) return null;

  const npcId = `npc-${crypto.randomUUID()}`;
  const displayName = (customName ?? def.name).trim() || def.name;
  const room = u.here;
  if (!room) return null;

  // -- Create the char record -------------------------------------------
  const ch = await createChar(npcId, def.splat);
  const char = (await findByPlayer(npcId))!;
  Object.assign(char, {
    status: "approved",
    chargenStep: 6,
    concept: def.kind,
    fullName: displayName,
    attributes: def.attributes,
    abilities: def.abilities,
    willpower: def.willpower,
    willpowerCurrent: def.willpower,
    rage: def.rage,
    rageCurrent: def.rage,
    ...(def.gnosis ? { gnosis: def.gnosis, gnosisCurrent: def.gnosis } : {}),
    isNpc: true,
    npcTemplate: def.slug,
    npcRoomId: room.id,
    npcKind: def.kind,
  });
  await saveChar(char);

  // -- Create the IDBObj in the room ------------------------------------
  // Using the same id as playerId makes target resolution + findByPlayer
  // line up without a separate lookup.
  await u.db.create({
    id: npcId,
    name: displayName,
    flags: new Set(["npc"]),
    location: room.id,
    contents: [],
    state: {
      reality: "material",
      description: def.description,
      npcKind: def.kind,
    },
  } as unknown as IDBObj);

  void ch;
  return { npcId, charId: char.id, templateSlug: def.slug };
}

/**
 * Despawn an NPC: delete its IDBObj and clean up the char record.
 * Returns true if the NPC was found and removed.
 */
export async function despawnNpc(u: IUrsamuSDK, npcId: string): Promise<boolean> {
  const char = await findByPlayer(npcId);
  if (!char || !char.isNpc) return false;
  try {
    await u.db.destroy(npcId);
  } catch (_) {
    // Best-effort -- the room IDBObj may already be gone.
  }
  // Mark the char deleted by setting an unreachable status. The chars
  // collection keeps the row for audit; npc IDBObj is gone so it can't
  // be targeted.
  char.status = "denied";
  await saveChar(char);
  // Clear npcRoomId explicitly -- conditional-spread can't unset.
  await unsetCharFields(char.id, ["npcRoomId"]);
  return true;
}

/** Find all NPC IDBObjs in a room. */
export function npcsInRoom(room: AnyObj): AnyObj[] {
  const here = room as { contents?: AnyObj[] };
  const items = Array.isArray(here?.contents) ? here.contents! : [];
  return items.filter((it) => it?.flags?.has?.("npc"));
}

/** Find PC IDBObjs in the same room (for NPC target picking). */
export function pcsInRoom(room: AnyObj): AnyObj[] {
  const here = room as { contents?: AnyObj[] };
  const items = Array.isArray(here?.contents) ? here.contents! : [];
  return items.filter((it) =>
    it?.flags?.has?.("player") && !it?.flags?.has?.("npc")
  );
}

/**
 * Drive one NPC turn: pick target(s), maybe declare a split, fire
 * resolveAttack against each pick, persist + narrate. Returns a short
 * summary for the caller to surface in init narration.
 */
export async function runNpcTurn(
  u: IUrsamuSDK,
  npcChar: IWoDChar,
): Promise<{ pose: string; engaged: number }> {
  if (!npcChar.isNpc) return { pose: "(not an NPC)", engaged: 0 };
  if (isIncapacitated(npcChar)) {
    return { pose: `${npcChar.fullName ?? "The creature"} lies broken.`, engaged: 0 };
  }
  const def = getNpcTemplate(npcChar.npcTemplate ?? "");
  if (!def) return { pose: "(no template)", engaged: 0 };

  const room = u.here;
  const targets = pcsInRoom(room);
  if (targets.length === 0) {
    return { pose: `${npcChar.fullName ?? def.name} prowls, finding no quarry.`, engaged: 0 };
  }

  // Decide split: 2+ targets and Rage to burn -> split into 2 actions.
  const splitCount = targets.length >= 2 && (npcChar.rageCurrent ?? 0) >= 2 ? 2 : 1;
  const penalty = splitCount - 1;
  if (splitCount > 1) {
    // Reflect the split decision on the npc char so existing audit logic
    // sees the actionDecl shape. Not persisted between turns.
    npcChar.actionDecl = { count: splitCount, used: 0, setAt: Date.now() };
  }

  // Sort PC targets by weakest first (lowest gnosisCurrent + healthCurrent
  // proxy -- simply pick those who have taken damage if any).
  const ranked = targets.slice().sort((a, b) => {
    // deno-lint-ignore no-explicit-any
    const ai = (a as any)?.state?.npcKind ? 1 : 0;
    // deno-lint-ignore no-explicit-any
    const bi = (b as any)?.state?.npcKind ? 1 : 0;
    return ai - bi; // PCs first, NPCs last
  });

  // Per-attack record: who got hit, with what verb, for how much.
  const strikes: Array<{ name: string; verb: string; dmg: number; type: DamageType }> = [];
  const isSpirit = (def.combatModel ?? "physical") === "spirit";

  for (let i = 0; i < splitCount; i++) {
    const tgtObj = ranked[i] ?? ranked[0];
    const defenderChar = await findByPlayer(tgtObj.id);
    if (!defenderChar || isIncapacitated(defenderChar)) continue;

    let dmg = 0;
    let dmgType: DamageType = def.attack.damageType;
    if (isSpirit) {
      // W20 Ch 7 spirit combat: pool = Rage, difficulty = target Willpower.
      // Net successes = damage; the spirit-bound damage type stands (typically
      // B for psychic banes, A for Wyrm-claw banes). Soak does not apply --
      // spirit-claws bypass physical hide.
      const pool = Math.max(1, (npcChar.rageCurrent ?? npcChar.rage ?? 1) - penalty);
      const diff = Math.max(2, Math.min(10, defenderChar.willpower ?? 6));
      const atkRoll = rollDice(pool, diff);
      // Honor a declared defense: all three kinds (dodge/block/parry) are
      // allowed against spirit-model banes per game ruling. Consume the
      // declaration whether the roll lands or not, then $unset to clear --
      // saveChar's conditional-spread can't remove the field on its own.
      let defenseNet = 0;
      if (defenderChar.pendingDefense) {
        const dPool = defensePool(defenderChar, defenderChar.pendingDefense.kind);
        const dRoll = rollDice(dPool, 6);
        defenseNet = dRoll.netSuccesses;
        consumePendingDefense(defenderChar);
        await unsetCharFields(defenderChar.id, ["pendingDefense"]);
      }
      dmg = Math.max(0, atkRoll.netSuccesses - defenseNet);
    } else {
      const opts: {
        abilityName: string;
        damageType: DamageType;
        weaponBonus: number;
        attackerPenalty: number;
        defenderHolder: AnyObj;
      } = {
        abilityName: def.attack.mode === "weapon" ? "Melee" :
                     def.attack.mode === "psychic" ? "Manipulation" : "Brawl",
        damageType: def.attack.damageType,
        weaponBonus: def.attack.bonus,
        attackerPenalty: penalty,
        defenderHolder: tgtObj,
      };
      const result = resolveAttack(npcChar, defenderChar, opts);
      dmg = result.finalDamage;
      dmgType = result.damageType;
    }
    if (dmg > 0) {
      applyDamage(defenderChar, dmgType, dmg);
      await saveChar(defenderChar);
    }
    strikes.push({
      name: (tgtObj.name as string) ?? "the target",
      verb:
        def.attack.mode === "bite"    ? "lunges and snaps at"        :
        def.attack.mode === "claws"   ? "rakes its claws across"     :
        def.attack.mode === "psychic" ? "claws at the mind of"       :
                                        "swings at",
      dmg,
      type: dmgType,
    });
  }

  // Persist NPC mutations (rage spend on split, etc.).
  if (splitCount > 1) {
    npcChar.rageCurrent = Math.max(0, (npcChar.rageCurrent ?? 0) - 1);
    npcChar.actionDecl = undefined;
  }
  await saveChar(npcChar);

  const actorName = npcChar.fullName ?? def.name;
  const engaged = strikes.length;
  const fmtStrike = (s: typeof strikes[number]) =>
    s.dmg > 0 ? `${s.verb} ${s.name} for ${s.dmg} ${s.type}` : `${s.verb} ${s.name}`;
  const pose = engaged === 0
    ? `${actorName} circles but finds no opening.`
    : engaged === 1
      ? `${actorName} ${fmtStrike(strikes[0])}.`
      : `${actorName} ${fmtStrike(strikes[0])}, then ${fmtStrike(strikes[1])}.`;
  poseRoom(u, `%cr${pose}%cn`);
  return { pose, engaged };
}

/**
 * Per-kill XP trickle. Parallels VOTE_XP_AMOUNT (0.20) -- five kills
 * round to 1 XP. Adjusted up or down here only; the math feeds every
 * future hunt and is intentionally small so it doesn't replace
 * roleplay-based award paths.
 */
export const KILL_XP_AMOUNT = 0.20;

export interface IKillRecord {
  /** Newly-earned titles, if any (one-shot per threshold). */
  titles: ITitleAward[];
  /** XP added to the killer (always KILL_XP_AMOUNT). */
  xpAwarded: number;
}

/**
 * Track an NPC kill. Increments the killer's `npcKills[kind]` counter,
 * evaluates the title catalog (one-shot per threshold), and awards a
 * small XP trickle. Returns the title-award list plus the XP amount
 * so the caller can narrate both.
 */
export async function recordNpcKill(
  killer: IWoDChar,
  kind: IWyrmNpcDef["kind"],
): Promise<IKillRecord> {
  const kills = killer.npcKills ?? {};
  kills[kind] = (kills[kind] ?? 0) + 1;
  killer.npcKills = kills;
  const awarded = maybeAwardTitles(killer);
  // Per-kill XP trickle. staffId "system" so awardXp's self-award guard
  // (rejects staffId === playerId) is bypassed without weakening it.
  const entry = awardXp(killer, KILL_XP_AMOUNT, `kill: ${kind}`, "system");
  await saveChar(killer);
  await createXpEntry(entry);
  return { titles: awarded, xpAwarded: KILL_XP_AMOUNT };
}
