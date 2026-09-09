// core/vtmRituals.ts -- VtM blood-magic ritual mechanics (pure).
// Casting: Int + Occult vs 3 + level, blood cost per def (V20 p.230).

import type { IWoDChar } from "./types.ts";
import {
  ALL_RITUALS,
  getRitual,
  type IRitualDef,
  type RitualSchool,
} from "../splats/vtm/data/rituals.ts";
import { rollDice, type IDiceRoll } from "./dice.ts";
import { effectiveAttr } from "./attributes.ts";
import { discDots } from "../splats/vtm/data/powers.ts";
import { spendPool } from "./pools.ts";
import { isKindred, kindredBlockMessage } from "./kindred.ts";

export const MAX_RITUAL_DIFFICULTY = 9;

export function schoolForRitual(def: IRitualDef): RitualSchool {
  return def.school;
}

/** School rating in dots (Thaumaturgy or Necromancy). */
export function schoolRating(char: IWoDChar, school: RitualSchool): number {
  return discDots(char.disciplines, school === "thaumaturgy"
    ? "Thaumaturgy"
    : "Necromancy");
}

export function knowsRitual(char: IWoDChar, slug: string): boolean {
  const key = slug.toLowerCase().trim();
  return (char.rituals ?? []).some((r) => r.toLowerCase() === key);
}

export function knownRituals(char: IWoDChar): IRitualDef[] {
  return (char.rituals ?? [])
    .map((s) => getRitual(s))
    .filter((d): d is IRitualDef => !!d);
}

export interface IRitualOpResult {
  ok: boolean;
  message: string;
  rituals?: string[];
}

/**
 * Learn a ritual (self-serve up to school rating, V20 p.230: rituals up
 * to the character's rating need only a teacher, which MUSH play treats
 * as available; staff may grant beyond that via +ritual/teach).
 */
export function learnRitual(
  char: IWoDChar,
  slugOrName: string,
  opts: { bypassCap?: boolean } = {},
): IRitualOpResult {
  const def = getRitual(slugOrName);
  if (!def) return { ok: false, message: `Unknown ritual: ${slugOrName}` };
  if (knowsRitual(char, def.slug)) {
    return { ok: false, message: `Already knows ${def.name}.` };
  }
  if (!opts.bypassCap) {
    const rating = schoolRating(char, def.school);
    if (rating < def.level) {
      return {
        ok: false,
        message:
          `${def.name} is a Level ${def.level} ${def.school} ritual -- ` +
          `your ${def.school === "thaumaturgy" ? "Thaumaturgy" : "Necromancy"} ` +
          `is ${rating}.`,
      };
    }
  }
  const next = [...(char.rituals ?? []), def.slug];
  return { ok: true, message: `Learned ${def.name}.`, rituals: next };
}

export function forgetRitual(
  char: IWoDChar,
  slugOrName: string,
): IRitualOpResult {
  const def = getRitual(slugOrName);
  if (!def) return { ok: false, message: `Unknown ritual: ${slugOrName}` };
  const current = char.rituals ?? [];
  if (!current.some((r) => r.toLowerCase() === def.slug)) {
    return { ok: false, message: `Doesn't know ${def.name}.` };
  }
  const next = current.filter((r) => r.toLowerCase() !== def.slug);
  return { ok: true, message: `Forgot ${def.name}.`, rituals: next };
}

export interface IRitualCastResult {
  ok: boolean;
  message: string;
  ritual?: IRitualDef;
  roll?: IDiceRoll;
  difficulty?: number;
  bloodLeft?: number;
  botch?: boolean;
  /** Number of successes the ritual effect fired with. */
  successes?: number;
  pose?: string;
  rollLine?: string;
}

/** Cast a known ritual. Mutates blood pool + powerFlags; caller persists. */
export function castRitual(
  char: IWoDChar,
  slugOrName: string,
  opts: { rng?: typeof rollDice } = {},
): IRitualCastResult {
  const rng = opts.rng ?? rollDice;
  if (!isKindred(char)) {
    return { ok: false, message: "Only Kindred perform blood-magic rituals." };
  }
  const def = getRitual(slugOrName);
  if (!def) return { ok: false, message: `Unknown ritual: ${slugOrName}` };
  if (!knowsRitual(char, def.slug)) {
    return {
      ok: false,
      message: `You don't know ${def.name}. (+ritual/learn ${def.slug})`,
    };
  }
  const block = kindredBlockMessage(char, "cast a ritual");
  if (block) return { ok: false, message: block, ritual: def };

  const rating = schoolRating(char, def.school);
  if (rating < def.level) {
    return {
      ok: false,
      message:
        `${def.name} requires ${def.school === "thaumaturgy" ? "Thaumaturgy" : "Necromancy"} ` +
        `${def.level}; you have ${rating}.`,
      ritual: def,
    };
  }

  if (def.bloodCost > 0) {
    const spend = spendPool(char, "blood", def.bloodCost);
    if (!spend.ok || spend.remaining === undefined) {
      return { ok: false, message: spend.message, ritual: def };
    }
    char.bloodPool = spend.remaining;
  }

  const pool = Math.max(
    1,
    effectiveAttr(char, "Intelligence") + (char.abilities?.["Occult"] ?? 0),
  );
  const difficulty = Math.min(MAX_RITUAL_DIFFICULTY, 3 + def.level);
  const roll = rng(pool, difficulty);

  const costNote = def.bloodCost > 0
    ? ` (-${def.bloodCost} Blood -> ${char.bloodPool}/${char.bloodMax})`
    : "";
  const rollLine =
    `Int+Occult (${pool}d vs ${difficulty}): [${roll.dice.join(" ")}] = ` +
    `${roll.netSuccesses}${roll.botch ? " BOTCH" : ""}`;

  if (roll.botch || roll.netSuccesses <= 0) {
    return {
      ok: false,
      message:
        `Ritual %ch${def.name}%cn fails${costNote}. ${rollLine}` +
        (roll.botch ? " Something goes horribly wrong (ST)." : ""),
      ritual: def,
      roll,
      difficulty,
      bloodLeft: char.bloodPool,
      botch: roll.botch,
      rollLine,
      pose: `fails the ritual ${def.name}`,
    };
  }

  if (def.effect === "flag" && def.flagKey) {
    char.powerFlags = {
      ...(char.powerFlags ?? {}),
      [def.flagKey]: def.flagValue ?? true,
    };
  }

  return {
    ok: true,
    message:
      `You complete %ch${def.name}%cn${costNote}. ${rollLine} ` +
      `${def.blurb}`,
    ritual: def,
    roll,
    difficulty,
    bloodLeft: char.bloodPool,
    successes: roll.netSuccesses,
    rollLine,
    pose: `performs the ritual ${def.name}`,
  };
}

export function ritualCastTime(def: IRitualDef): string {
  return def.castTime ?? `${def.level * 5} minutes`;
}

export { ALL_RITUALS, getRitual };
