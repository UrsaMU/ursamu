// XP cost table loader and helpers.
//
// The cost table is data-driven from `resources/xp_costs.json` so template
// plugins can override individual rows without code changes. Categories are
// keyed by the canonical CoFD 2e trait class names; see docs/xp-beats-spec.md.

import {
  COFD_ATTRIBUTES,
  COFD_SKILLS,
  COFD_MERITS,
  parseMeritRef,
} from "../dictionary/index.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";
import type { CofdSheet } from "../stats/sheet.ts";

export interface XpCostEntry {
  /** Cost per dot, if scaling per-dot. */
  costPerDot?: number;
  /** Flat cost (e.g. Skill Specialty: 1 XP per purchase, no scaling). */
  costFlat?: number;
  /** Whether the cost draws from the Arcane Experience pool. */
  arcane: boolean;
}

export interface XpCostsFile {
  version?: string;
  conversion: {
    beatsPerExperience: number;
    arcaneBeatsPerArcaneExperience: number;
  };
  costs: Record<string, XpCostEntry>;
}

const xpCostsUrl = new URL("../../resources/xp_costs.json", import.meta.url);

/** Parsed, typed XP cost table loaded once at module init. */
export const XP_COSTS: XpCostsFile = JSON.parse(Deno.readTextFileSync(xpCostsUrl));

/**
 * Returns the cost to raise a trait of `traitType` from `currentDots` to
 * `currentDots + 1`. Flat-cost traits ignore the current dot count.
 *
 * Throws if the trait type is not in the cost table.
 */
export function getCost(
  traitType: string,
  _currentDots: number,
): { cost: number; arcane: boolean } {
  const entry = XP_COSTS.costs[traitType];
  if (!entry) {
    throw new Error(`Unknown XP trait type: '${traitType}'.`);
  }
  if (typeof entry.costFlat === "number") {
    return { cost: entry.costFlat, arcane: !!entry.arcane };
  }
  return { cost: entry.costPerDot ?? 0, arcane: !!entry.arcane };
}

/**
 * Maps a trait name to its XP category for the given sheet's active template.
 * Returns `null` if the trait is not a known XP-purchasable category.
 *
 * Recognized categories:
 *   - "attribute", "skill", "merit"
 *   - "supernatural-power" (template-gated power list)
 *   - "power-stat" (template-gated Blood Potency / Wyrd / Gnosis / etc.)
 *   - "willpower"
 *   - "integrity" (the template's morality stat; "integrity" is the canonical
 *     category name from the cost table, but the renderer matches the
 *     template's `moralityName` so Humanity/Wisdom/Harmony/Clarity all route
 *     here)
 */
export function categorizeTrait(traitName: string, sheet: CofdSheet): string | null {
  const key = traitName.toLowerCase().trim();

  if (COFD_ATTRIBUTES.includes(key)) return "attribute";
  if (COFD_SKILLS.includes(key)) return "skill";

  // Merits -- accept qualified form: language(spanish), contacts:police.
  const meritRef = parseMeritRef(key);
  if (COFD_MERITS.find(m => m.key === meritRef.merit)) return "merit";

  if (key === "willpower") return "willpower";

  const tKey = sheet.template.toLowerCase().trim();
  const tmpl = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;

  if (key === tmpl.moralityName.toLowerCase()) return "integrity";

  // Power stat aliases (bp, pu).
  const powerAliases = new Set<string>([tmpl.powerStatName.toLowerCase()]);
  if (tmpl.powerStatName === "Blood Potency") powerAliases.add("bp");
  if (tmpl.powerStatName === "Primal Urge") powerAliases.add("pu");
  if (powerAliases.has(key) && tmpl.powerStatName !== "None") return "power-stat";

  if (tmpl.validPowers.includes(key)) return "supernatural-power";

  return null;
}
