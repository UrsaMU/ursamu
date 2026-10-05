// Pure XP-spend resolver. Computes cumulative cost from the trait's current
// value up to `targetDots` and, on success, returns an updated sheet with the
// trait raised and the appropriate XP pool decremented.
//
// All validation flows through existing `setTrait`, so prerequisite checks
// and template gating behave identically to a manual +sheet/set edit.

import { setTrait } from "../stats/setter.ts";
import { migrateSheet, type CofdSheet } from "../stats/sheet.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";
import { categorizeTrait, getCost, XP_COSTS } from "./costs.ts";
import { parseMeritRef } from "../dictionary/index.ts";

export interface SpendResult {
  sheet?: CofdSheet;
  error?: string;
  cost?: number;
  arcane?: boolean;
}

/**
 * Returns the current dot count for `key` on the sheet, looking in the
 * appropriate bucket for the trait's category. Returns 0 if absent.
 */
function currentDots(sheet: CofdSheet, key: string, category: string): number {
  switch (category) {
    case "attribute":
      return sheet.attributes[key] ?? 0;
    case "skill":
      return sheet.skills[key] ?? 0;
    case "merit": {
      // Look up by qualified storage key (language:spanish) when present.
      const ref = parseMeritRef(key);
      return sheet.merits[ref.storageKey] ?? 0;
    }
    case "supernatural-power":
      return sheet.powers[key] ?? 0;
    case "power-stat":
      return sheet.powerStatValue ?? 0;
    case "willpower":
      return sheet.advantages.willpowerMax ?? 0;
    case "integrity":
      return sheet.moralityValue ?? 0;
    default:
      return 0;
  }
}

/**
 * Resolves an XP purchase: raise `traitName` to `targetDots` if the character
 * can afford it. Pure -- returns a new sheet on success. On failure, returns
 * `{ error }`.
 *
 * Cumulative pricing rule: each intermediate dot is charged at its own
 * `costPerDot` (CofD 2e abolished per-rating multipliers, so per-dot is
 * constant), then summed. Flat-cost categories (specialty) ignore current
 * dots and charge once.
 */
export function spendXp(
  sheet: CofdSheet,
  traitName: string,
  targetDots: number,
): SpendResult {
  const migrated = migrateSheet({ ...sheet });
  const key = traitName.toLowerCase().trim();
  if (!key) return { error: "Trait name is required." };

  const category = categorizeTrait(key, migrated);
  if (!category) return { error: `Unknown trait '${traitName}'.` };

  const entry = XP_COSTS.costs[category];
  if (!entry) return { error: `No XP cost defined for trait type '${category}'.` };

  const arcane = !!entry.arcane;

  // Flat-cost categories pay once regardless of current rating.
  if (typeof entry.costFlat === "number") {
    const cost = entry.costFlat;
    const pool = arcane ? (migrated.arcaneExperience ?? 0) : (migrated.experience ?? 0);
    if (pool < cost) {
      return {
        error: `Insufficient ${arcane ? "Arcane Experience" : "Experience"}: have ${pool}, need ${cost}.`,
      };
    }
    // Flat-cost paths (currently just specialty) are not actually wired to
    // setTrait here -- callers that need flat-cost spending should run the
    // domain-specific command (e.g. +sheet/set specialty/...) and then
    // settle the XP separately. Return an error to keep the API honest.
    return {
      error: `Flat-cost trait type '${category}' must be purchased via its native command (e.g. +sheet/set specialty/...).`,
    };
  }

  const current = currentDots(migrated, key, category);
  if (targetDots <= current) {
    return { error: `Trait is already at or above ${targetDots} dots.` };
  }

  // Cumulative per-dot cost. Per-dot is constant in CofD 2e, but keeping the
  // accumulator preserves the door for future per-rating-multiplier rules.
  let totalCost = 0;
  for (let dot = current + 1; dot <= targetDots; dot++) {
    totalCost += getCost(category, dot - 1).cost;
  }

  const pool = arcane ? (migrated.arcaneExperience ?? 0) : (migrated.experience ?? 0);
  if (pool < totalCost) {
    return {
      error: `Insufficient ${arcane ? "Arcane Experience" : "Experience"}: have ${pool}, need ${totalCost}.`,
    };
  }

  // Power Stat / Morality / Willpower are not always settable via setTrait()
  // by the trait *name* alone -- but in all three cases setTrait does support
  // direct writes to the canonical name (or alias). For power-stat we pass
  // the template's canonical alias so setTrait routes the write correctly.
  let writeKey = key;
  if (category === "power-stat") {
    const tKey = migrated.template.toLowerCase().trim();
    const tmpl = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;
    writeKey = tmpl.powerStatName.toLowerCase();
  } else if (category === "integrity") {
    const tKey = migrated.template.toLowerCase().trim();
    const tmpl = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;
    writeKey = tmpl.moralityName.toLowerCase();
  }

  let updated: CofdSheet;
  try {
    if (category === "willpower") {
      // Willpower is a derived advantage; raising the *permanent* max isn't
      // exposed through setTrait. Update the struct directly.
      updated = { ...migrated, advantages: { ...migrated.advantages, willpowerMax: targetDots, willpowerCurrent: Math.max(migrated.advantages.willpowerCurrent, current) } };
    } else {
      updated = setTrait(migrated, writeKey, targetDots);
    }
  } catch (err) {
    return { error: (err as Error).message };
  }

  if (arcane) {
    updated.arcaneExperience = pool - totalCost;
  } else {
    updated.experience = pool - totalCost;
  }

  return { sheet: updated, cost: totalCost, arcane };
}
