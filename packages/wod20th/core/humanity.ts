// core/humanity.ts -- Path checks & degeneration (V20 simplified).

import type { IWoDChar } from "./types.ts";
import { rollDice, type IDiceRoll } from "./dice.ts";
import { isKindred } from "./kindred.ts";
import {
  HUMANITY_SINS,
  ALL_PATHS,
  getPath,
  pathForChar,
} from "../splats/vtm/data/paths.ts";

export { HUMANITY_SINS, ALL_PATHS, getPath, pathForChar };

export function parseSinLevel(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = parseInt(raw, 10);
  if (n < 1 || n > 10) return null;
  return n;
}

function checkVirtuePool(char: IWoDChar, virtueName: string): number {
  const v = char.virtues ?? {};
  const n = v[virtueName] ??
    v[virtueName.toLowerCase()] ??
    // Fallback aliases for Path virtue swaps.
    (virtueName === "Conviction"
      ? (v.Conscience ?? v.conscience)
      : undefined) ??
    (virtueName === "Instinct"
      ? (v["Self-Control"] ?? v.Conscience)
      : undefined);
  if (typeof n === "number" && n > 0) return n;
  return 1;
}

export interface IHumanityCheckResult {
  ok: boolean;
  message: string;
  roll?: IDiceRoll;
  lost?: boolean;
  humanity?: number;
  sinLevel?: number;
  path?: string;
}

/**
 * Path check when committing a sin at `sinLevel`.
 * Uses the character's path hierarchy and check virtue.
 * If path rating > sinLevel would be "beneath" -- acts at/above rating skip.
 * If fail/botch: lose 1 path rating (min 0).
 */
export function humanityCheck(
  char: IWoDChar,
  sinLevel: number,
  rng: typeof rollDice = rollDice,
): IHumanityCheckResult {
  if (!isKindred(char)) {
    return { ok: false, message: "Only Kindred track path ratings." };
  }
  const path = pathForChar(char.path);
  const sin = path.sins[sinLevel];
  if (!sin) {
    return { ok: false, message: "Sin level must be 1-10." };
  }
  const hum = char.humanity ?? 0;
  if (hum <= 0) {
    return {
      ok: false,
      message: `${path.name} is already 0 (wight / lost path).`,
      path: path.name,
    };
  }
  if (sinLevel >= hum) {
    return {
      ok: true,
      message:
        `Sin L${sinLevel} (${sin.label}) is at/above ${path.name} ` +
        `${hum} -- no degeneration roll.`,
      humanity: hum,
      sinLevel,
      lost: false,
      path: path.name,
    };
  }

  const pool = Math.max(1, checkVirtuePool(char, path.checkVirtue));
  const diff = 8;
  const roll = rng(pool, diff);
  if (roll.botch || roll.netSuccesses <= 0) {
    char.humanity = Math.max(0, hum - 1);
    return {
      ok: true,
      message:
        `${path.checkVirtue} fails vs L${sinLevel} (${sin.label}). ` +
        `${path.name} ${hum} -> ${char.humanity}.`,
      roll,
      lost: true,
      humanity: char.humanity,
      sinLevel,
      path: path.name,
    };
  }
  return {
    ok: true,
    message:
      `${path.checkVirtue} holds vs L${sinLevel} (${sin.label}). ` +
      `${path.name} remains ${hum}.`,
    roll,
    lost: false,
    humanity: hum,
    sinLevel,
    path: path.name,
  };
}

/** Staff set path rating directly. */
export function setHumanity(
  char: IWoDChar,
  value: number,
): { ok: boolean; message: string; humanity?: number } {
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    return { ok: false, message: "Path rating must be 0-10." };
  }
  const old = char.humanity ?? 0;
  char.humanity = value;
  if (!char.path) char.path = "Humanity";
  return {
    ok: true,
    message: `${char.path} ${old} -> ${value}.`,
    humanity: value,
  };
}

/**
 * Adopt a Path of Enlightenment. Optionally remaps virtue keys.
 * Does not change rating.
 */
export function setPath(
  char: IWoDChar,
  pathName: string,
): { ok: boolean; message: string } {
  if (!isKindred(char)) {
    return { ok: false, message: "Only Kindred walk Paths." };
  }
  const path = getPath(pathName);
  if (!path) {
    return {
      ok: false,
      message:
        `Unknown path "${pathName}". ` +
        `Try: ${ALL_PATHS.map((p) => p.name).join(", ")}.`,
    };
  }
  const old = char.path ?? "Humanity";
  char.path = path.name;
  // Seed path virtues if missing (Conviction / Instinct).
  const v = { ...(char.virtues ?? {}) };
  if (path.virtues) {
    for (const name of path.virtues) {
      if (v[name] === undefined) {
        // Map from Humanity virtues if present.
        if (name === "Conviction" && v.Conscience !== undefined) {
          v.Conviction = v.Conscience;
        } else if (
          name === "Instinct" && v["Self-Control"] !== undefined
        ) {
          v.Instinct = v["Self-Control"];
        } else if (v[name] === undefined) {
          v[name] = 2;
        }
      }
    }
  }
  char.virtues = v;
  return {
    ok: true,
    message: `Path ${old} -> ${path.name} (${path.book}).`,
  };
}
