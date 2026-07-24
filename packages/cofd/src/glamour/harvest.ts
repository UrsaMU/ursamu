// Harvest / Reap Glamour (CtL 2e pp.103–104). Pure helpers.

import type { CofdSheet } from "../stats/sheet.ts";
import { addCondition } from "../subsystems/conditions.ts";
import { isChangelingSheet } from "../form/mask.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";

export interface HarvestResult {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  gained: number;
  lines: string[];
}

export interface ReapResult {
  ok: boolean;
  reason?: string;
  actorSheet?: CofdSheet;
  victimSheet?: CofdSheet;
  gained: number;
  wpTaken: number;
  lines: string[];
  /** Caller should run +integrity/break on the actor. */
  breakingPoint: boolean;
}

function glamourMax(sheet: CofdSheet): number {
  const tmpl = COFD_TEMPLATES[sheet.template] ??
    COFD_TEMPLATES.mortal;
  return tmpl.energyMaxFormula(sheet.powerStatValue || 1);
}

/**
 * Apply harvest successes: +1 Glamour per success, capped at max.
 * Fae targets cannot be harvested (caller should gate; pure check too).
 */
export function applyHarvest(
  sheet: CofdSheet,
  successes: number,
  opts: { fromFae?: boolean } = {},
): HarvestResult {
  if (!isChangelingSheet(sheet)) {
    return {
      ok: false,
      reason: "Only changelings harvest Glamour.",
      gained: 0,
      lines: [],
    };
  }
  if (opts.fromFae) {
    return {
      ok: false,
      reason: "Cannot harvest Glamour from fae beings.",
      gained: 0,
      lines: [],
    };
  }
  const succ = Math.max(0, Math.floor(successes));
  if (succ < 1) {
    return {
      ok: false,
      reason: "No successes — no Glamour harvested.",
      gained: 0,
      lines: ["Harvest fails; the emotion slips away."],
    };
  }
  const cur = sheet.energyCurrent ?? 0;
  const max = glamourMax(sheet);
  const gained = Math.min(succ, Math.max(0, max - cur));
  const next: CofdSheet = {
    ...sheet,
    energyCurrent: cur + gained,
  };
  return {
    ok: true,
    sheet: next,
    gained,
    lines: [
      `You harvest %cy${gained}%cn Glamour ` +
        `(${succ} success${succ === 1 ? "" : "es"}).`,
      `  Glamour now ${next.energyCurrent}/${max}.`,
    ],
  };
}

/**
 * Reap: fill Glamour to max; victim loses WP = Wyrd and gains Ravaged.
 * Breaking point for the reaper is caller-side.
 */
export function applyReap(
  actor: CofdSheet,
  victim: CofdSheet,
): ReapResult {
  if (!isChangelingSheet(actor)) {
    return {
      ok: false,
      reason: "Only changelings reap Glamour.",
      gained: 0,
      wpTaken: 0,
      lines: [],
      breakingPoint: false,
    };
  }
  if (isChangelingSheet(victim)) {
    return {
      ok: false,
      reason: "Cannot reap fae beings (including Lost).",
      gained: 0,
      wpTaken: 0,
      lines: [],
      breakingPoint: false,
    };
  }
  const wyrd = Math.max(1, actor.powerStatValue || 1);
  const max = glamourMax(actor);
  const cur = actor.energyCurrent ?? 0;
  const gained = Math.max(0, max - cur);
  const actorSheet: CofdSheet = {
    ...actor,
    energyCurrent: max,
  };

  const vWp = victim.advantages?.willpowerCurrent ?? 0;
  const wpTaken = Math.min(wyrd, Math.max(0, vWp));
  let victimSheet: CofdSheet = {
    ...victim,
    advantages: {
      ...victim.advantages,
      willpowerCurrent: Math.max(0, vWp - wpTaken),
    },
  };
  victimSheet = addCondition(victimSheet, "ravaged");

  return {
    ok: true,
    actorSheet,
    victimSheet,
    gained,
    wpTaken,
    breakingPoint: true,
    lines: [
      `You %crreap%cn emotion — Glamour filled ` +
        `(+${gained}, now ${max}).`,
      `  Victim: −${wpTaken} Willpower, Ravaged Condition.`,
      "  Breaking point: resolve with +integrity/break.",
    ],
  };
}
