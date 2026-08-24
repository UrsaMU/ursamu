/**
 * Cyberpunk RED -- Dice Rolling Utilities
 *
 * All randomness in one place for easy mocking in tests.
 */

// -- Primitive rollers ---------------------------------------------------------

/** Roll a single d10 (1-10). */
export const d10 = (): number => Math.floor(Math.random() * 10) + 1;

/** Roll a single d6 (1-6). */
export const d6 = (): number => Math.floor(Math.random() * 6) + 1;

/** Roll n d6 dice. Returns individual results. */
export const rollND6 = (n: number): number[] =>
  Array.from({ length: n }, () => d6());

/** Roll a d10 with critical success/failure exploding behavior. */
export const rollD10Critical = (): { base: number; extra: number; total: number } => {
  const base = d10();
  if (base === 10) {
    const extra = d10();
    return { base, extra, total: base + extra };
  }
  if (base === 1) {
    const extra = d10();
    return { base, extra: -extra, total: base - extra };
  }
  return { base, extra: 0, total: base };
};

// -- Skill checks --------------------------------------------------------------

export interface IRollResult {
  stat: number;
  skill: number;
  roll: number;
  extra: number;  // from critical success/failure
  total: number;
  critSuccess: boolean;
  critFail: boolean;
  vs?: number;    // DV or opposed total
  success?: boolean;
}

/**
 * Core CPR skill check: STAT + Skill + 1d10 vs DV (or opposed).
 * Returns full result with crit detection.
 */
export const skillCheck = (stat: number, skill: number, dv?: number): IRollResult => {
  const { base, extra, total: rollTotal } = rollD10Critical();
  const total = stat + skill + rollTotal;
  return {
    stat,
    skill,
    roll: base,
    extra,
    total,
    critSuccess: base === 10,
    critFail: base === 1,
    vs: dv,
    success: dv !== undefined ? total >= dv : undefined,
  };
};

/**
 * Opposed check: attacker vs defender.
 * Ties go to defender.
 */
export const opposedCheck = (
  atkStat: number,
  atkSkill: number,
  defStat: number,
  defSkill: number
): { attacker: IRollResult; defender: IRollResult; attackerWins: boolean } => {
  const atk = skillCheck(atkStat, atkSkill);
  const def = skillCheck(defStat, defSkill);
  // Ties favor defender
  const attackerWins = atk.total > def.total;
  return { attacker: atk, defender: def, attackerWins };
};

// -- Initiative ----------------------------------------------------------------

/** Roll initiative: REF + 1d10. */
export const rollInitiative = (ref: number): number => ref + d10();

// -- Damage --------------------------------------------------------------------

export interface IDamageResult {
  dice: number[];       // individual d6 results
  total: number;        // sum before armor
  sixCount: number;     // number of natural 6s
  isCritical: boolean;  // 2+ sixes
}

/**
 * Roll weapon damage (n d6).
 * For melee weapons, add BODY stat before calling.
 */
export const rollDamage = (numDice: number): IDamageResult => {
  const dice = rollND6(numDice);
  const total = dice.reduce((sum, d) => sum + d, 0);
  const sixCount = dice.filter((d) => d === 6).length;
  return { dice, total, sixCount, isCritical: sixCount >= 2 };
};

/** Apply armor reduction: damage - SP = net damage (min 1 if hit). */
export const applyArmor = (rawDamage: number, sp: number): number =>
  Math.max(0, rawDamage - sp);

// -- Death Saves ---------------------------------------------------------------

/**
 * Death Save: roll 1d10, must roll <= BODY - deathSavePenalty.
 * Rolling a 10 is always a failure.
 */
export const rollDeathSave = (
  body: number,
  penalty: number
): { roll: number; target: number; success: boolean } => {
  const roll = d10();
  const target = body - penalty;
  const success = roll !== 10 && roll <= target;
  return { roll, target, success };
};

// -- Facedown ------------------------------------------------------------------

/**
 * Reputation Facedown: COOL + Reputation + 1d10.
 * Negative reputation counts as negative number.
 */
export const rollFacedown = (
  cool: number,
  reputation: number
): { roll: number; total: number } => {
  const roll = d10();
  const total = cool + reputation + roll;
  return { roll, total };
};

// -- Difficulty Values ---------------------------------------------------------

export const DV = {
  SIMPLE: 9,
  EVERYDAY: 13,
  DIFFICULT: 15,
  PROFESSIONAL: 17,
  HEROIC: 21,
  INCREDIBLE: 24,
  LEGENDARY: 29,
} as const;

export type DVName = keyof typeof DV;

export const dvName = (dv: number): string => {
  if (dv <= 9) return "Simple (DV9)";
  if (dv <= 13) return "Everyday (DV13)";
  if (dv <= 15) return "Difficult (DV15)";
  if (dv <= 17) return "Professional (DV17)";
  if (dv <= 21) return "Heroic (DV21)";
  if (dv <= 24) return "Incredible (DV24)";
  return "Legendary (DV29)";
};

// -- Price Category to EB ------------------------------------------------------

export const PRICE_TO_EB: Record<string, number> = {
  cheap: 10,
  everyday: 50,
  costly: 100,
  premium: 500,
  expensive: 1000,
  very_expensive: 5000,
  luxury: 10000,
  super_luxury: 50000,
};

export const priceToEB = (category: string): number =>
  PRICE_TO_EB[category.toLowerCase()] ?? 0;

export const craftDVAndTime = (
  category: string
): { dv: number; timeDisplay: string; timeMs: number } => {
  const map: Record<string, { dv: number; timeDisplay: string; timeMs: number }> = {
    cheap:          { dv: 9,  timeDisplay: "1 hour",  timeMs: 60 * 60 * 1000 },
    everyday:       { dv: 9,  timeDisplay: "1 hour",  timeMs: 60 * 60 * 1000 },
    costly:         { dv: 13, timeDisplay: "6 hours", timeMs: 6 * 60 * 60 * 1000 },
    premium:        { dv: 17, timeDisplay: "1 day",   timeMs: 24 * 60 * 60 * 1000 },
    expensive:      { dv: 21, timeDisplay: "1 week",  timeMs: 7 * 24 * 60 * 60 * 1000 },
    very_expensive: { dv: 24, timeDisplay: "2 weeks", timeMs: 14 * 24 * 60 * 60 * 1000 },
    luxury:         { dv: 29, timeDisplay: "1 month", timeMs: 30 * 24 * 60 * 60 * 1000 },
    super_luxury:   { dv: 29, timeDisplay: "1 month per 10k eb", timeMs: 30 * 24 * 60 * 60 * 1000 },
  };
  return map[category.toLowerCase()] ?? map.everyday;
};
