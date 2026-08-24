/**
 * Cyberpunk RED -- Character Calculation Utilities
 * Pure functions for deriving stats, HP, wound states, and character construction.
 */
import type { ICPRCharacter, ICPRStats, WoundState, Role } from "../db/schemas.ts";
import { SKILLS, BASIC_SKILLS } from "../data/skills.ts";

// -- HP Calculation ------------------------------------------------------------

/**
 * Max HP = 10 + ceil((BODY + WILL) / 2)
 * Source: CPR Core p.72
 */
export const calcMaxHP = (body: number, will: number): number =>
  10 + Math.ceil((body + will) / 2);

/**
 * Seriously Wounded Threshold = ceil(maxHP / 2)
 */
export const calcSWThreshold = (maxHp: number): number =>
  Math.ceil(maxHp / 2);

// -- EMP / Humanity Loss -------------------------------------------------------

/**
 * Current EMP = empBase - floor(humanityLoss / 10)
 * Cyberpsychosis occurs when currentEMP <= 0
 */
export const calcCurrentEMP = (empBase: number, humanityLoss: number): number =>
  empBase - Math.floor(humanityLoss / 10);

export const isCyberpsychosisRisk = (empBase: number, hl: number): boolean =>
  calcCurrentEMP(empBase, hl) <= 0;

// -- Wound State ---------------------------------------------------------------

/**
 * Derive wound state from current HP and thresholds.
 * Source: CPR Core p.220
 */
export const deriveWoundState = (
  currentHp: number,
  maxHp: number,
  swThreshold: number
): WoundState => {
  if (currentHp >= maxHp) return "healthy";
  if (currentHp >= swThreshold) return "lightly";
  if (currentHp >= 1) return "seriously";
  return "mortally";
};

/**
 * Wound state action penalty to all checks.
 * Pass the character's cyberware array to apply Pain Editor (ignores -2 for seriously wounded).
 * Pain Editor does NOT help with mortal wounds.
 */
export const woundActionPenalty = (
  state: WoundState,
  cyberware?: Array<{ name: string }>,
): number => {
  if (state === "seriously") {
    const hasPainEditor = cyberware?.some((cw) => cw.name === "pain_editor") ?? false;
    return hasPainEditor ? 0 : -2;
  }
  if (state === "mortally") return -4;
  return 0;
};

/**
 * Wound state MOVE penalty.
 */
export const woundMovePenalty = (state: WoundState): number => {
  if (state === "seriously" || state === "mortally") return -6;
  return 0;
};

// -- Critical Injury Penalties -------------------------------------------------

/** Sum of Death Save Penalties from all untreated critical injuries. */
export const totalDeathSavePenalty = (char: ICPRCharacter): number =>
  char.criticalInjuries
    .filter((inj) => !inj.treated)
    .reduce((sum, inj) => sum + inj.deathSavePenalty, 0) +
  char.deathSavePenalty;

// -- Cyberware Skill Bonuses ---------------------------------------------------

/**
 * Passive skill bonus granted by installed cyberware.
 * Returns the total bonus to apply to a given skill name.
 *
 * | Cyberware              | Bonus skill(s)                         |
 * |------------------------|----------------------------------------|
 * | image_enhance          | +2 perception                          |
 * | amplified_hearing      | +2 perception                          |
 * | voice_stress_analyzer  | +2 human_perception, +2 interrogation  |
 */
export const getCyberwareSkillBonus = (
  cyberware: Array<{ name: string }>,
  skillName: string,
): number => {
  let bonus = 0;
  for (const cw of cyberware) {
    switch (cw.name) {
      case "image_enhance":
        if (skillName === "perception") bonus += 2;
        break;
      case "amplified_hearing":
        if (skillName === "perception") bonus += 2;
        break;
      case "voice_stress_analyzer":
        if (skillName === "human_perception" || skillName === "interrogation") bonus += 2;
        break;
    }
  }
  return bonus;
};

// -- Skill Resolution ----------------------------------------------------------

/**
 * Resolve stat + skill total for a roll.
 * Includes wound penalties for non-exempt rolls.
 */
export const resolveSkillTotal = (
  char: ICPRCharacter,
  statKey: keyof ICPRStats,
  skillName: string
): { stat: number; skill: number; penalty: number } => {
  const rawStat = char.stats[statKey] as number;
  const skillLevel = char.skills[skillName] ?? 0;
  const penalty = woundActionPenalty(char.woundState, char.cyberware);
  return { stat: rawStat, skill: skillLevel, penalty };
};

/**
 * Effective stat value (includes cyberware modifiers, wound penalties, etc.)
 */
export const effectiveStat = (char: ICPRCharacter, statKey: keyof ICPRStats): number =>
  char.stats[statKey] as number;

/**
 * Effective MOVE (after wound and armor penalties, minimum 1).
 */
export const effectiveMove = (char: ICPRCharacter): number => {
  const base = char.stats.move;
  const woundPen = woundMovePenalty(char.woundState);
  const armorPen = (char.armorBody?.penalty ?? 0) + (char.armorHead?.penalty ?? 0);
  return Math.max(1, base + woundPen + armorPen);
};

// -- Damage Application --------------------------------------------------------

/**
 * Apply damage to a character's HP. Returns new character state.
 * Does NOT mutate. Does NOT apply critical injuries (handled separately).
 */
export const applyDamageToChar = (
  char: ICPRCharacter,
  netDamage: number
): { char: ICPRCharacter; newHp: number; newWoundState: WoundState } => {
  const newHp = Math.max(-1, char.hp.current - netDamage); // -1 = mortally wounded floor
  const clampedHp = Math.max(0, newHp); // stored value never < 0
  const newWoundState = newHp <= 0
    ? "mortally"
    : deriveWoundState(clampedHp, char.hp.max, char.swThreshold);

  const updated: ICPRCharacter = {
    ...char,
    hp: { ...char.hp, current: clampedHp },
    woundState: newWoundState,
  };

  return { char: updated, newHp: clampedHp, newWoundState };
};

/**
 * Apply healing to a character. Returns new HP and derived wound state.
 */
export const applyHealingToChar = (
  char: ICPRCharacter,
  amount: number
): { newHp: number; newWoundState: WoundState } => {
  const newHp = Math.min(char.hp.max, char.hp.current + amount);
  const newWoundState = deriveWoundState(newHp, char.hp.max, char.swThreshold);
  return { newHp, newWoundState };
};

// -- Character Initialization --------------------------------------------------

/** Default skill set for a new character (basic skills at level 2). */
export const defaultSkills = (): Record<string, number> => {
  const skills: Record<string, number> = {};
  for (const s of BASIC_SKILLS) {
    skills[s.name] = 2;
  }
  return skills;
};

/** Build a minimal new ICPRCharacter with defaults. */
export const buildNewCharacter = (role: Role): ICPRCharacter => {
  const stats: ICPRStats = {
    int: 5, ref: 5, dex: 5, tech: 5, cool: 5,
    will: 5, luck: 5, move: 5, body: 5,
    emp: 5, empBase: 5,
  };
  const maxHp = calcMaxHP(stats.body, stats.will);
  const swThreshold = calcSWThreshold(maxHp);

  return {
    stats,
    hp: { max: maxHp, current: maxHp },
    swThreshold,
    deathSave: stats.body,
    deathSavePenalty: 0,
    role,
    roleRank: 4,
    roleData: {},
    skills: defaultSkills(),
    luckRemaining: stats.luck,
    woundState: "healthy",
    criticalInjuries: [],
    armorBody: null,
    armorHead: null,
    cyberware: [],
    humanityLoss: 0,
    bodysculpt: [],
    gear: [],
    activeEffects: [],
    reputation: 0,
    reputationDeeds: [],
    eurodollars: 0,
    lifestyle: null,
    lifepath: {},
    chargenComplete: false,
    chargenStatus: "draft",
    conceptNotes: "",
    chargenRejectReason: "",
    chargenStage: "method",
    chargenMethod: null,
    restTimer: null,
    humanityGainedAt: null,
    locationEffects: [],
  };
};

/**
 * Recalculate derived stats after any stat change.
 * Call after HP-affecting stat modifications (BODY or WILL changes).
 */
export const recalcDerived = (char: ICPRCharacter): ICPRCharacter => {
  const maxHp = calcMaxHP(char.stats.body, char.stats.will);
  const swThreshold = calcSWThreshold(maxHp);
  const currentHp = Math.min(char.hp.current, maxHp);
  const currentEMP = calcCurrentEMP(char.stats.empBase, char.humanityLoss);

  return {
    ...char,
    hp: { max: maxHp, current: currentHp },
    swThreshold,
    deathSave: char.stats.body,
    stats: {
      ...char.stats,
      emp: Math.max(0, currentEMP),
    },
    woundState: deriveWoundState(currentHp, maxHp, swThreshold),
  };
};

// -- Session Reset -------------------------------------------------------------

/**
 * Reset Luck pool to full at start of session.
 * Clear expired drug effects.
 */
export const sessionReset = (char: ICPRCharacter): ICPRCharacter => {
  const now = Date.now();
  return {
    ...char,
    luckRemaining: char.stats.luck,
    activeEffects: char.activeEffects.filter((e) => e.expiresAt > now),
  };
};

// -- Stat Validation -----------------------------------------------------------

export const STAT_MIN = 2;
export const STAT_MAX = 10;

export const isValidStat = (value: number): boolean =>
  Number.isInteger(value) && value >= STAT_MIN && value <= STAT_MAX;

/** Stat point costs for chargen Complete Package method (min 2, max 8 during creation). */
export const CHARGEN_STAT_MAX = 8;
export const CHARGEN_STAT_MIN = 2;
export const CHARGEN_POINTS = 62;
