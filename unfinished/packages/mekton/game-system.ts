import type { IGameSystem } from "./types.ts";
import type { IMektonChar } from "./schema.ts";
import { STAT_KEYS, HARD_SKILLS } from "./validation.ts";
import { derivedStats } from "./derived.ts";

export const mektonSystem: IGameSystem = {
  id: "mekton-zeta",
  name: "Mekton Zeta",
  version: "1.0.0",
  source: "ingested",
  ingestedFrom: ["mekton-zeta-core.txt", "mekton-zeta-plus.txt"],

  coreRulesPrompt: `SYSTEM: Mekton Zeta (Interlock System, R. Talsorian Games)
RESOLUTION: STAT + SKILL + 1D10 vs. Difficulty Number.
  10=Easy / 15=Average / 20=Difficult / 25=Very Difficult / 30=Nearly Impossible.
  Roll 10 = Critical Success (roll again, add; chain on consecutive 10s).
  Roll 1 = Critical Failure (roll again, subtract once).
STATS: att, bod, cl, emp, int, luck, ma, ref, tech, edu. Range 2–10, avg 6.
  Stability (resist manipulation) = floor(CL × 2.5). Luck = per-session bonus pool.
SKILLS: +1–+10, linked to stats. Hard [H] skills cap at +5 at chargen.
MECHA: Separate mecha skill set (Mecha Piloting, Gunnery, Melee, Fighting, Missiles).`,

  moveThresholds: { fullSuccess: 20, partialSuccess: 15 },

  stats: ["att", "bod", "cl", "emp", "int", "luck", "ma", "ref", "tech", "edu"] as const,

  adjudicationHint:
    "Interlock is not fiction-first — rolls are called when skill matters. " +
    "Stack stat + skill + 1D10 vs difficulty. Use Stability (CL×2.5) for social contests. " +
    "Luck points let players add +1 per point spent; remind them to use it.",

  hardMoves: [
    "Mecha takes critical damage to a servo (roll 1D10 for location: 1=Head, 2-4=Torso, 5-10=Limb)",
    "Enemy pilot ejects; becomes a ground combatant with a personal grudge",
    "Collateral damage — civilian installation, friendly mecha, or terrain feature destroyed",
    "Communications jammed — player loses contact with command until repaired (Mecha Tech roll)",
    "Power plant damaged — MA halved until successful Mecha Tech roll",
  ],

  softMoves: [
    "Enemy targeting lock acquired — next attack roll at +2",
    "Damage warning light on the console — something's wrong but not critical yet",
    "Civilian or ally in the crossfire — player must choose to act or watch",
    "Mecha systems running hot — next hard hit risks shutdown",
    "A familiar voice on the enemy comms",
  ],

  missConsequenceHint:
    "On a failed roll: the situation worsens, the enemy acts, or the task simply fails. " +
    "Critical Failures (rolled 1 then high) cause immediate negative consequences: " +
    "equipment malfunction, enemy counterattack, or stat damage. " +
    "In mecha combat, a miss means the enemy goes next and hits back.",

  getCategories: () => ["attributes", "skills"],

  getStats: (category?: string) => {
    if (category === "skills") return [];
    return [...STAT_KEYS];
  },

  getStat: (actor: Record<string, unknown>, stat: string): unknown => {
    const char = actor as unknown as IMektonChar;
    if (STAT_KEYS.includes(stat as typeof STAT_KEYS[number])) {
      return char.stats[stat as keyof typeof char.stats];
    }
    return char.skills[stat] ?? 0;
  },

  setStat: async (actor: Record<string, unknown>, stat: string, value: unknown): Promise<void> => {
    const char = actor as unknown as IMektonChar;
    if (STAT_KEYS.includes(stat as typeof STAT_KEYS[number])) {
      char.stats[stat as keyof typeof char.stats] = value as number;
    } else {
      char.skills[stat] = value as number;
    }
    await Promise.resolve();
  },

  validate: (stat: string, value: unknown): boolean | string => {
    const num = value as number;
    if (STAT_KEYS.includes(stat as typeof STAT_KEYS[number])) {
      if (num < 2 || num > 10) return `${stat} must be 2–10.`;
      return true;
    }
    if (HARD_SKILLS.has(stat) && num > 5) {
      return `${stat} is Hard [H]; max +5 at chargen.`;
    }
    if (num < 1 || num > 10) return `${stat} skill must be 1–10.`;
    return true;
  },

  formatMoveResult: (moveName: string, stat: string, total: number, roll: [number, number]): string =>
    `${moveName} (${stat}): rolled ${roll[0]}+${roll[1]} = ${total}`,

  formatCharacterContext: (sheet: Record<string, unknown>): string => {
    const char = sheet as unknown as IMektonChar;
    const d = derivedStats(char);
    const statBlock = `ATT:${char.stats.att} BOD:${char.stats.bod} CL:${char.stats.cl} EMP:${char.stats.emp} INT:${char.stats.int} LUCK:${char.stats.luck} MA:${char.stats.ma} REF:${char.stats.ref} TECH:${char.stats.tech} EDU:${char.stats.edu}`;
    const topSkills = Object.entries(char.skills)
      .filter(([, v]) => v >= 3)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    const wounds = `Head:${char.wounds?.head ?? d.headHp}/${d.headHp} Torso:${char.wounds?.torso ?? d.torsoHp}/${d.torsoHp}`;
    return `${char.playerName} | ${statBlock} | Skills: ${topSkills || "none notable"} | Wounds: ${wounds} | Luck: ${char.luckRemaining ?? char.stats.luck}`;
  },
};
