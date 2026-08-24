/**
 * Vehicle critical + cyberlimb malfunction + cybershell tables.
 */
import vehicleCrit from "../data/vehicle-critical.json" with {
  type: "json",
};
import cyberlimb from "../data/cyberlimb-malfunction.json" with {
  type: "json",
};
import cybershell from "../data/cybershell-critical.json" with {
  type: "json",
};
import type { ICriticalInjury } from "../db/schemas.ts";

type Row = { roll: number; slug: string; effect: string };

const VEH = vehicleCrit as Row[];
const LIMB = cyberlimb as Row[];

function d6(rng: () => number): number {
  return Math.max(1, Math.min(6, Math.floor(rng() * 6) + 1));
}

function pickByRoll(rows: Row[], roll: number): Row {
  const hit = rows.find((r) => r.roll === roll);
  if (hit) return hit;
  // vehicle uses 1–7; clamp high
  const max = rows.reduce((m, r) => Math.max(m, r.roll), 1);
  return rows.find((r) => r.roll === Math.min(roll, max)) ??
    rows[rows.length - 1];
}

export type VehicleCrit = {
  roll: number;
  slug: string;
  effect: string;
  wrecked: boolean;
};

/** d6, +1 if already wrecked/crit stacking (cap 7). */
export function rollVehicleCritical(
  alreadyBad = false,
  rng = Math.random,
): VehicleCrit {
  let roll = d6(rng);
  if (alreadyBad) roll = Math.min(7, roll + 1);
  const row = pickByRoll(VEH, roll);
  return {
    roll,
    slug: row.slug,
    effect: row.effect,
    wrecked: roll >= 7 || /wreck|scrap|explode/i.test(row.effect),
  };
}

export type LimbMalfunction = {
  roll: number;
  slug: string;
  effect: string;
  glitch: boolean;
};

/** 2d6 table (rolls 2–12). */
export function rollCyberlimbMalfunction(
  rng = Math.random,
): LimbMalfunction {
  const roll = d6(rng) + d6(rng);
  const row = pickByRoll(LIMB, roll);
  return {
    roll,
    slug: row.slug,
    effect: row.effect,
    glitch: /glitch/i.test(row.effect),
  };
}

interface ShellSev {
  roll: number;
  slug: string;
  effect: string;
}
interface ShellLoc {
  roll: number;
  slug: string;
}

const shellSev = (cybershell as { severity: ShellSev[] })
  .severity;
const shellLoc = (cybershell as { locations: ShellLoc[] })
  .locations;

/** Cybershell critical (p.37) — same shape as flesh crit. */
export function rollCybershellCritical(
  alreadyCritical: boolean,
  rng = Math.random,
): ICriticalInjury {
  let sevRoll = d6(rng);
  if (alreadyCritical) sevRoll += 3;
  const locRoll = d6(rng);
  const sevEntry = sevRoll >= 7
    ? shellSev.find((s) => s.roll === 7) ?? shellSev.at(-1)!
    : shellSev.find((s) => s.roll === Math.min(sevRoll, 6)) ??
      shellSev[0];
  const loc = shellLoc.find((l) => l.roll === locRoll) ??
    shellLoc[0];
  return {
    severity: sevRoll,
    severityName: sevEntry.slug,
    location: loc.slug,
    effect: sevEntry.effect,
    at: Date.now(),
  };
}
