// Predatory Aura projection (VtR 2e).

import data from "../../resources/vampire.json" with { type: "json" };
import type { CofdSheet } from "../stats/sheet.ts";
import { addCondition } from "../subsystems/conditions.ts";
import { executeRoll, type RollResult } from "../roller/execute.ts";
import { isVampireSheet, clampBp } from "../vitae/index.ts";
import { effectiveAttr } from "../stats/effective.ts";

export interface AuraFlavor {
  readonly key: string;
  readonly condition: string;
  readonly label: string;
}

export const AURA_FLAVORS: readonly AuraFlavor[] = Object.freeze(
  (data.auraFlavors as AuraFlavor[]).map((f) =>
    Object.freeze({ ...f })
  ),
);

export function findAuraFlavor(name: string): AuraFlavor | null {
  const q = name.trim().toLowerCase();
  return (
    AURA_FLAVORS.find(
      (f) =>
        f.key === q ||
        f.label.toLowerCase() === q ||
        f.condition === q,
    ) ?? null
  );
}

export interface AuraProjectInput {
  presence: number;
  intimidation: number;
  bloodPotency: number;
}

export interface AuraResistInput {
  composure: number;
  /** BP for vampires; 0 for mortals; other tolerance. */
  tolerance: number;
}

export interface AuraContestResult {
  projectPool: number;
  resistPool: number;
  projectRoll: RollResult;
  resistRoll: RollResult;
  projectorWins: boolean;
  flavor: AuraFlavor;
}

export function rollAuraContest(
  project: AuraProjectInput,
  resist: AuraResistInput,
  flavor: AuraFlavor,
  inject?: { project?: RollResult; resist?: RollResult },
): AuraContestResult {
  const projectPool = Math.max(
    0,
    (project.presence | 0) +
      (project.intimidation | 0) +
      (project.bloodPotency | 0),
  );
  const resistPool = Math.max(
    0,
    (resist.composure | 0) + (resist.tolerance | 0),
  );
  const projectRoll = inject?.project ?? executeRoll(projectPool);
  const resistRoll = inject?.resist ?? executeRoll(resistPool);

  let projectorWins =
    projectRoll.successes > resistRoll.successes;
  // Higher BP wins ties (projector BP vs resist tolerance when both Kindred).
  if (projectRoll.successes === resistRoll.successes) {
    projectorWins =
      (project.bloodPotency | 0) >= (resist.tolerance | 0);
  }

  return {
    projectPool,
    resistPool,
    projectRoll,
    resistRoll,
    projectorWins,
    flavor,
  };
}

export function applyAuraCondition(
  target: CofdSheet,
  flavor: AuraFlavor,
  note?: string,
): CofdSheet {
  return addCondition(
    target,
    flavor.condition,
    note ?? flavor.label,
  );
}

export function projectorPools(sheet: CofdSheet): AuraProjectInput {
  return {
    presence: effectiveAttr(sheet, "presence"),
    intimidation: sheet.skills?.intimidation ?? 0,
    bloodPotency: clampBp(sheet.powerStatValue || 0),
  };
}

export function resistPools(sheet: CofdSheet | null): AuraResistInput {
  if (!sheet) {
    return { composure: 2, tolerance: 0 };
  }
  const composure = effectiveAttr(sheet, "composure");
  if (isVampireSheet(sheet)) {
    return {
      composure,
      tolerance: clampBp(sheet.powerStatValue || 1),
    };
  }
  // Other supernaturals: use power stat as tolerance when present.
  const tol = sheet.powerStatValue | 0;
  return { composure, tolerance: Math.max(0, tol) };
}
