// Pure helpers for invoking a Contract (CtL) with mien exceptional.

import type { CofdSheet } from "../stats/sheet.ts";
import { findContract, type CtlContract } from "../dictionary/changeling.ts";
import { contractExceptionalActive } from "./mien.ts";

export interface ParsedContractCost {
  glamour: number;
  willpower: number;
  raw: string;
}

/** Parse "2 Glamour", "1 Glamour + 1 Willpower", "None", etc. */
export function parseContractCost(cost: string): ParsedContractCost {
  const raw = (cost ?? "").trim();
  if (!raw || /^none$/i.test(raw) || raw === "—") {
    return { glamour: 0, willpower: 0, raw };
  }
  let glamour = 0;
  let willpower = 0;
  const g = raw.match(/(\d+)\s*glamour/i);
  if (g) glamour = parseInt(g[1], 10);
  const w = raw.match(/(\d+)\s*willpower/i);
  if (w) willpower = parseInt(w[1], 10);
  // "1-2 Glamour" → take the lower bound for invoke
  const range = raw.match(/(\d+)\s*-\s*(\d+)\s*glamour/i);
  if (range) glamour = parseInt(range[1], 10);
  return { glamour, willpower, raw };
}

export function ownsContract(
  sheet: CofdSheet,
  name: string,
): boolean {
  const q = name.trim().toLowerCase();
  return (sheet.contracts ?? []).some(
    (c) => c.toLowerCase().trim() === q,
  );
}

export function resolveOwnedContract(
  sheet: CofdSheet,
  name: string,
): CtlContract | null {
  if (!ownsContract(sheet, name)) return null;
  return findContract(name);
}

/**
 * After a successful Contract roll while Mask is down, promote to
 * exceptional and floor successes at max(rolled, Wyrd).
 * (Mantle dots not tracked yet.)
 */
export function applyMienContractBoost(
  sheet: CofdSheet,
  successes: number,
): { successes: number; exceptional: boolean; boosted: boolean } {
  if (successes < 1 || !contractExceptionalActive(sheet)) {
    return {
      successes,
      exceptional: successes >= 5,
      boosted: false,
    };
  }
  const wyrd = sheet.powerStatValue || 0;
  const next = Math.max(successes, wyrd);
  return {
    successes: next,
    exceptional: true,
    boosted: true,
  };
}

/** Dice pool string is rollable (not None / —). */
export function contractHasDicePool(c: CtlContract): boolean {
  const p = (c.dicePool ?? "").trim();
  if (!p || /^none$/i.test(p) || p === "—") return false;
  return true;
}

/**
 * Normalize catalog dice pool for parseRollExpression
 * (e.g. "Presence + Subterfuge + Wyrd").
 */
export function contractPoolExpr(c: CtlContract): string {
  return (c.dicePool ?? "")
    .replace(/\s+vs\.?\s+.*/i, "")
    .replace(/\s*-\s*\w+.*$/i, "")
    .trim();
}
