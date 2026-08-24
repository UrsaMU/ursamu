/**
 * NPC engine -- spawn from template, apply damage, normalize for combat.
 */
import type {
  ICPRNpc, ICPRStats, IArmorState, WoundState,
} from "../db/schemas.ts";
import type { NpcTemplate } from "../data/npcs.ts";
import { calcSWThreshold, deriveWoundState } from "./character.ts";

const armorState = (
  src: { name: string; sp: number } | null,
): IArmorState | null =>
  src ? { name: src.name, sp: src.sp, currentSp: src.sp, penalty: 0 } : null;

/** Build an NPC stat block from a template, ready to write to state.cprNpc. */
export const buildNpc = (
  tpl: NpcTemplate,
  spawnedBy: string,
  displayName?: string,
  aiKey = "aggressive",
): ICPRNpc => ({
  archetype: tpl.id,
  displayName: displayName ?? tpl.name,
  tier: tpl.tier,
  stats: { ...tpl.stats },
  skills: { ...tpl.skills },
  hp: { max: tpl.hp, current: tpl.hp },
  swThreshold: calcSWThreshold(tpl.hp),
  deathSave: tpl.stats.body,
  deathSavePenalty: 0,
  woundState: "healthy",
  armorBody: armorState(tpl.armorBody),
  armorHead: armorState(tpl.armorHead),
  weapon: { ...tpl.weapon },
  spawnedAt: Date.now(),
  spawnedBy,
  aiKey,
});

/** Apply damage to an NPC. Returns updated NPC and the new wound state. */
export const applyDamageToNpc = (
  npc: ICPRNpc,
  netDamage: number,
): { npc: ICPRNpc; newWoundState: WoundState } => {
  const newHp = Math.max(0, npc.hp.current - netDamage);
  const wentMortal = npc.hp.current - netDamage <= 0;
  const newWoundState: WoundState = wentMortal
    ? (newHp === 0 ? "mortally" : "mortally")
    : deriveWoundState(newHp, npc.hp.max, npc.swThreshold);

  return {
    npc: {
      ...npc,
      hp: { ...npc.hp, current: newHp },
      woundState: newWoundState,
    },
    newWoundState,
  };
};

/**
 * Combat-defender shape -- the subset of fields the attack resolver reads
 * from a target. Both ICPRCharacter and ICPRNpc can be projected to this.
 */
export interface CombatDefenderView {
  isNpc: boolean;
  stats: ICPRStats;
  skills: Record<string, number>;
  hp: { max: number; current: number };
  swThreshold: number;
  woundState: WoundState;
  armorBody: IArmorState | null;
  armorHead: IArmorState | null;
}

/** Project an NPC into the shared defender view. */
export const npcAsDefender = (npc: ICPRNpc): CombatDefenderView => ({
  isNpc: true,
  stats: npc.stats,
  skills: npc.skills,
  hp: npc.hp,
  swThreshold: npc.swThreshold,
  woundState: npc.woundState,
  armorBody: npc.armorBody,
  armorHead: npc.armorHead,
});
