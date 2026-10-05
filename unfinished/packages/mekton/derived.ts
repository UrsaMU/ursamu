import type { IMektonChar, IMektonWounds } from "./schema.ts";

/** BOD lookup tables for derived stats. Index 0 = BOD 1 (unused), 1 = BOD 1... use bodIndex(). */
function bodIndex(bod: number): number {
  if (bod <= 2) return 0;
  if (bod <= 4) return 1;
  if (bod <= 7) return 2;
  if (bod <= 9) return 3;
  return 4; // 10
}

const HEAD_HP   = [4, 5, 6, 7, 8];
const TORSO_HP  = [8, 10, 12, 14, 16];
const LIMB_HP   = [6, 7, 9, 10, 12];
const STUN_VAL  = [4, 5, 6, 7, 8];
const LIFT_KG   = [20, 40, 60, 90, 120];
const THROW_M   = [6, 12, 20, 26, 30];
const DMG_BONUS = [-2, -1, 0, 1, 2];
const EV_VAL    = [2, 2, 4, 6, 8];

export interface IDerivedStats {
  headHp: number;
  torsoHp: number;
  limbHp: number;
  stun: number;
  lift: number;
  throwM: number;
  dmgBonus: number;
  ev: number;
  stability: number;
  skillPoints: number;
}

export function derivedStats(char: IMektonChar): IDerivedStats {
  const bi = bodIndex(char.stats.bod);
  return {
    headHp:     HEAD_HP[bi],
    torsoHp:    TORSO_HP[bi],
    limbHp:     LIMB_HP[bi],
    stun:       STUN_VAL[bi],
    lift:       LIFT_KG[bi],
    throwM:     THROW_M[bi],
    dmgBonus:   DMG_BONUS[bi],
    ev:         EV_VAL[bi],
    stability:  Math.floor(char.stats.cl * 2.5),
    skillPoints: char.stats.int + char.stats.edu + 10,
  };
}

/** Max HP for each location based on BOD. */
export function maxWounds(char: IMektonChar): IMektonWounds {
  const bi = bodIndex(char.stats.bod);
  return {
    head:  HEAD_HP[bi],
    torso: TORSO_HP[bi],
    rArm:  LIMB_HP[bi],
    lArm:  LIMB_HP[bi],
    rLeg:  LIMB_HP[bi],
    lLeg:  LIMB_HP[bi],
  };
}

/** Effective MA after encumbrance penalty. */
export function effectiveMA(char: IMektonChar): number {
  const bi = bodIndex(char.stats.bod);
  const ev = EV_VAL[bi];
  const totalWeight = char.equipment.reduce((sum, item) => sum + item.weight, 0);
  const load = Math.floor(totalWeight / ev);
  return Math.max(0, char.stats.ma - load);
}

/** Total skill points spent by the character. */
export function skillPointsSpent(skills: Record<string, number>): number {
  return Object.values(skills).reduce((sum, level) => {
    if (level <= 5) return sum + level;
    return sum + 5 + (level - 5) * 2;
  }, 0);
}
