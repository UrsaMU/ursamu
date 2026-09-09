// core/rites.ts -- Pure WtA rite mechanics (learn/forget/cast).
// No side effects: callers persist the returned `rites` array.
import type { IWoDChar } from "./types.ts";
import { WTA_RITES, type IRiteDef } from "../splats/wta/data/rites.ts";
import { rollDice, type IDiceRoll } from "./dice.ts";
import { woundPenalty } from "./wounds.ts";

const DEFAULT_RITE_DIFFICULTY = 7;

export interface IRiteOpResult {
  ok: boolean;
  message: string;
  rites?: string[];
}

export interface IRiteCastResult {
  ok: boolean;
  roll: IDiceRoll;
  message: string;
}

/** Look up a rite definition by slug. */
export function getRite(slug: string): IRiteDef | undefined {
  return WTA_RITES[slug.toLowerCase().trim()];
}

/** Has the character learned this rite? */
export function knowsRite(char: IWoDChar, slug: string): boolean {
  const key = slug.toLowerCase().trim();
  return (char.rites ?? []).some((r) => r.toLowerCase() === key);
}

/** Add a rite to the character's known list. Pure; caller persists. */
export function learnRite(char: IWoDChar, slug: string): IRiteOpResult {
  const key = slug.toLowerCase().trim();
  const def = WTA_RITES[key];
  if (!def) return { ok: false, message: `Unknown rite: ${slug}` };
  const current = char.rites ?? [];
  if (current.some((r) => r.toLowerCase() === key)) {
    return { ok: false, message: `Already knows ${def.name}.`, rites: current };
  }
  const next = [...current, key];
  return { ok: true, message: `Learned ${def.name}.`, rites: next };
}

/** Remove a rite from the character's known list. */
export function forgetRite(char: IWoDChar, slug: string): IRiteOpResult {
  const key = slug.toLowerCase().trim();
  const current = char.rites ?? [];
  if (!current.some((r) => r.toLowerCase() === key)) {
    return { ok: false, message: "Rite not known.", rites: current };
  }
  const next = current.filter((r) => r.toLowerCase() !== key);
  const def = WTA_RITES[key];
  return { ok: true, message: `Forgot ${def?.name ?? slug}.`, rites: next };
}

/**
 * Perform the cast roll for a rite. The pool is the caster's permanent Gnosis
 * plus any environmental bonus dice (e.g. caern ritualDieBonus); difficulty
 * defaults to the rite's `difficulty` (or 7). No persistence.
 */
export function castRite(
  char: IWoDChar,
  slug: string,
  difficultyOverride?: number,
  extraDice = 0,
): IRiteCastResult {
  const key = slug.toLowerCase().trim();
  const def = WTA_RITES[key];
  if (!def) {
    return {
      ok: false,
      roll: rollDice(1, DEFAULT_RITE_DIFFICULTY),
      message: `Unknown rite: ${slug}`,
    };
  }
  const basePool = Math.max(1, char.gnosis ?? 1);
  const pool = Math.max(1,
    basePool + Math.max(0, Math.floor(extraDice)) - woundPenalty(char));
  const diff = difficultyOverride ?? def.difficulty ?? DEFAULT_RITE_DIFFICULTY;
  const roll = rollDice(pool, diff);
  let outcome: string;
  if (roll.botch) outcome = "%crBOTCH%cn -- the rite goes terribly awry.";
  else if (roll.netSuccesses === 0) outcome = "Failure. The rite does not take.";
  else if (roll.exceptional) outcome = "%cgExceptional success%cn -- the rite resonates strongly.";
  else outcome = `Success (${roll.netSuccesses}).`;
  return {
    ok: roll.netSuccesses > 0,
    roll,
    message: `${def.name} (L${def.level} ${def.category}): ${outcome}`,
  };
}
