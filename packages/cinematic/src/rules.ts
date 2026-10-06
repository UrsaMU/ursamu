/** Core Cinematic Unisystem math (Cinematic Unisystem RPG, pp. 5-47). */
import { traitDef } from "./data.ts";
import type { AttrKey, ICinChar } from "./types.ts";

/** Human cap on Attributes at chargen (p.4). */
export const ATTR_HUMAN_MAX = 6;
export const ATTR_SOFT_CAP = 5;

/** Skill cap at chargen (unwritten; practical mastery range 7-10, p.8). */
export const SKILL_MAX = 10;

/** Max drawback points at chargen (p.6). */
export const DRAWBACK_CAP = 10;

/** Success threshold (p.43). */
export const TARGET = 9;

/** Cost to buy an Attribute at `level` (p.4): 1/level to 5, 8 for 6. */
export function attrCost(level: number): number {
  if (level <= 0) return 0;
  if (level <= ATTR_SOFT_CAP) return level;
  if (level === ATTR_HUMAN_MAX) return 8;
  return 8 + 3 * (level - ATTR_HUMAN_MAX);
}

/** Total spent on attributes (chargen assumes from 0). */
export function attrSpent(c: ICinChar): number {
  return (Object.values(c.attrs) as number[]).reduce(
    (sum, lvl) => sum + attrCost(lvl),
    0,
  );
}

/** Cost to buy a Skill at `level` (p.8): 1/level to 5, +3 after. */
export function skillCost(level: number): number {
  if (level <= 0) return 0;
  if (level <= 5) return level;
  return 5 + 3 * (level - 5);
}

export function skillSpent(c: ICinChar): number {
  return Object.values(c.skills).reduce(
    (sum, lvl) => sum + skillCost(lvl),
    0,
  );
}

/** Quality points spent — cost x level per entry;
 * template-granted entries are free. */
export function qualitySpent(c: ICinChar): number {
  return c.qualities.reduce(
    (sum, e) =>
      e.granted
        ? sum
        : sum + (traitDef(e.slug)?.cost ?? 0) * e.level,
    0,
  );
}

/** Drawback points gained. */
export function drawbackSpent(c: ICinChar): number {
  return c.drawbacks.reduce(
    (sum, e) => sum + (traitDef(e.slug)?.cost ?? 0) * e.level,
    0,
  );
}

/** Life Points = (Str+Con)x4+10; +3 per Hard to Kill level (p.6/14). */
export function lifePoints(c: ICinChar, htkLevels = 0): number {
  return (c.attrs.strength + c.attrs.constitution) * 4 + 10 +
    htkLevels * 3;
}

/** Success Level from a roll total (p.44). */
export function successLevels(total: number): number {
  if (total < TARGET) return 0;
  if (total <= 10) return 1;
  if (total <= 12) return 2;
  if (total <= 14) return 3;
  if (total <= 16) return 4;
  if (total <= 20) return 5;
  if (total <= 23) return 6;
  if (total <= 26) return 7;
  if (total <= 29) return 8;
  if (total <= 32) return 9;
  if (total <= 35) return 10;
  return 10 + Math.ceil((total - 35) / 3);
}

export const SL_LABELS = [
  "Adequate",
  "Decent",
  "Good",
  "Very Good",
  "Excellent",
  "Extraordinary",
  "Mind-boggling",
  "Outrageous",
  "Superheroic",
  "God-like",
];

export function slLabel(sl: number): string {
  return SL_LABELS[Math.min(Math.max(sl, 1), 10) - 1] ?? "?";
}

/** NPC Ability Scores (p.47). */
export function muscleScore(str: number): number {
  return str * 2 + 6;
}

export function combatScore(
  dex: number,
  combatSkills: number[],
): number {
  const avg = combatSkills.length
    ? combatSkills.reduce((a, b) => a + b, 0) / combatSkills.length
    : 0;
  return dex + Math.round(avg) + 6;
}

export function brainsScore(
  mental: [number, number, number],
  skills: number[],
): number {
  const [int, per, will] = mental;
  const mAvg = (int + per + will) / 3;
  const sAvg = skills.length
    ? skills.reduce((a, b) => a + b, 0) / skills.length
    : 0;
  return Math.round(mAvg + sAvg) + 6;
}

/** Drama Point costs for Back From the Dead (p.68). */
export const BFD_COSTS = { nextSeason: 1, nextEpisode: 5, sameEpisode: 10 };

export function dramaRemaining(c: ICinChar): number {
  return Math.max(0, c.dramaPoints - c.dramaSpent);
}

export type AttrOrSkill = AttrKey | string;

/** Highest appropriate defense skill slug for a dodge (p.52). */
export function bestDefenseSkill(c: ICinChar): string {
  const opts = ["acrobatics", "kung-fu", "getting-medieval"];
  let best = "";
  let bestVal = -1;
  for (const o of opts) {
    const v = c.skills[o] ?? 0;
    if (v > bestVal) {
      bestVal = v;
      best = o;
    }
  }
  return best;
}
