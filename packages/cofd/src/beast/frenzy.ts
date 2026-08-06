// Frenzy resist / ride / enter (VtR 2e Beast).

import type { CofdSheet } from "../stats/sheet.ts";
import { addCondition, hasCondition, removeCondition } from "../subsystems/conditions.ts";
import { executeRoll, type RollResult } from "../roller/execute.ts";
import { isVampireSheet } from "../vitae/index.ts";
import { humanityModifier } from "../vitae/table.ts";
import { clampSituational } from "../integrity/engine.ts";

export type FrenzyKind = "hunger" | "anger" | "terror";

export interface FrenzyRollInput {
  kind: FrenzyKind;
  resolve: number;
  composure: number;
  humanity: number;
  /** Situational mod from stimulus intensity. */
  modifier?: number;
}

export type FrenzyOutcome =
  | "dramatic"
  | "failure"
  | "success"
  | "exceptional";

export interface FrenzyRollResult {
  outcome: FrenzyOutcome;
  pool: number;
  humanityMod: number;
  roll: RollResult;
  kind: FrenzyKind;
}

export function rollFrenzyResist(
  input: FrenzyRollInput,
  injectRoll?: RollResult,
): FrenzyRollResult {
  const humanityMod = humanityModifier(input.humanity);
  const situational = clampSituational(input.modifier ?? 0);
  const raw =
    (input.resolve | 0) +
    (input.composure | 0) +
    humanityMod +
    situational;
  const pool = Math.max(0, raw);
  const roll = injectRoll ?? executeRoll(pool);

  let outcome: FrenzyOutcome;
  if (roll.isChanceDie && roll.dramaticFailure) {
    outcome = "dramatic";
  } else if (roll.dramaticFailure) outcome = "dramatic";
  else if (roll.exceptional) outcome = "exceptional";
  else if (roll.successes > 0) outcome = "success";
  else outcome = "failure";

  return {
    outcome,
    pool,
    humanityMod,
    roll,
    kind: input.kind,
  };
}

export function isFrenzied(sheet: CofdSheet): boolean {
  return hasCondition(sheet, "frenzied");
}

/** Enter frenzy (or ride the wave with WP). */
export function enterFrenzy(
  sheet: CofdSheet,
  kind: FrenzyKind,
  opts: { ride?: boolean } = {},
): { ok: boolean; reason?: string; sheet?: CofdSheet; lines: string[] } {
  if (!isVampireSheet(sheet)) {
    return {
      ok: false,
      reason: "Only vampires frenzy.",
      lines: [],
    };
  }
  let next: CofdSheet = {
    ...sheet,
    advantages: { ...sheet.advantages },
    conditions: [...(sheet.conditions ?? [])],
    customFields: { ...(sheet.customFields ?? {}) },
  };

  if (opts.ride) {
    const wp = next.advantages.willpowerCurrent | 0;
    if (wp < 1) {
      return {
        ok: false,
        reason: "Riding the Wave costs 1 Willpower.",
        lines: [],
      };
    }
    next.advantages.willpowerCurrent = wp - 1;
    next.customFields.frenzy = `riding:${kind}`;
    next = addCondition(next, "frenzied", `Riding the Wave (${kind})`);
    return {
      ok: true,
      sheet: next,
      lines: [
        `You ride the ${kind} frenzy ` +
          `(−1 Willpower). Keep one clear objective.`,
      ],
    };
  }

  next.customFields.frenzy = kind;
  next = addCondition(next, "frenzied", kind);
  return {
    ok: true,
    sheet: next,
    lines: [
      `%crThe Beast surges — ${kind} frenzy!%cn ` +
        `+2 Physical; ignore wounds; no WP on Social.`,
    ],
  };
}

export function endFrenzy(
  sheet: CofdSheet,
): { ok: boolean; reason?: string; sheet?: CofdSheet; lines: string[] } {
  if (!isFrenzied(sheet)) {
    return {
      ok: false,
      reason: "Not currently frenzied.",
      lines: [],
    };
  }
  let next: CofdSheet = {
    ...sheet,
    customFields: { ...(sheet.customFields ?? {}) },
    conditions: [...(sheet.conditions ?? [])],
  };
  next = removeCondition(next, "frenzied");
  delete next.customFields.frenzy;
  return {
    ok: true,
    sheet: next,
    lines: ["The Beast recedes. Frenzy ends."],
  };
}

export function parseFrenzyKind(raw: string): FrenzyKind | null {
  const q = raw.trim().toLowerCase();
  if (q === "hunger" || q === "hunger frenzy") return "hunger";
  if (q === "anger" || q === "rage") return "anger";
  if (
    q === "terror" ||
    q === "fear" ||
    q === "rotschreck" ||
    q === "rötschreck"
  ) {
    return "terror";
  }
  return null;
}
