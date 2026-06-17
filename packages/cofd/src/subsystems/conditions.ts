// Conditions and Tilts subsystem -- pure functions over CofdSheet.
//
// The catalog is loaded from resources/conditions.json at module load time.
// Each catalog entry is identified by a lowercase-kebab key (e.g. "shaken",
// "embarrassing-secret"). Conditions, Personal Tilts, and Environmental
// Tilts share the same catalog shape but differ by `category`. Only
// resolution of "condition" entries awards Beats; Tilts are scene-bound
// and award no Beats per CoFD 2e core.
//
// M5 keeps Condition Beats Standard (non-arcane). M6 may override for
// template-specific supernatural sources (Vampire frenzy, etc).

import type { CofdSheet, ConditionInstance } from "../stats/sheet.ts";
import { addBeats } from "../xp/index.ts";

export interface ConditionCatalogEntry {
  name: string;
  category: "condition" | "tilt-personal" | "tilt-environmental";
  persistent: boolean;
  description: string;
  effect: string;
  resolution: string;
  beats: number;
}

const catalogUrl = new URL("../../resources/conditions.json", import.meta.url);

/** Catalog of every known Condition and Tilt, keyed by lowercase-kebab slug. */
export const CONDITIONS: Record<string, ConditionCatalogEntry> = JSON.parse(
  Deno.readTextFileSync(catalogUrl),
);

/** Returns the catalog entry for a key, or undefined if unknown. */
export function lookupCondition(key: string): ConditionCatalogEntry | undefined {
  if (!key) return undefined;
  return CONDITIONS[key.toLowerCase().trim()];
}

/** True when the sheet already has an active condition with this key. */
export function hasCondition(sheet: CofdSheet, key: string): boolean {
  const k = key.toLowerCase().trim();
  const list = sheet.conditions ?? [];
  return list.some((c) => c.key === k);
}

/**
 * Add a condition by key. Returns a new sheet. No-op if the catalog key is
 * unknown or the condition is already present (uniqueness by key).
 */
export function addCondition(
  sheet: CofdSheet,
  key: string,
  note?: string,
): CofdSheet {
  const k = key.toLowerCase().trim();
  if (!lookupCondition(k)) return sheet;
  const list = sheet.conditions ?? [];
  if (list.some((c) => c.key === k)) return sheet;

  const entry: ConditionInstance = note ? { key: k, note } : { key: k };
  return { ...sheet, conditions: [...list, entry] };
}

/**
 * Remove a condition without awarding any Beats. Use this for ST corrections
 * (mistakenly applied condition, scene cleanup, etc). For player-driven
 * resolution that earns Beats, use `resolveCondition` instead.
 */
export function removeCondition(sheet: CofdSheet, key: string): CofdSheet {
  const k = key.toLowerCase().trim();
  const list = sheet.conditions ?? [];
  const next = list.filter((c) => c.key !== k);
  if (next.length === list.length) return sheet;
  return { ...sheet, conditions: next };
}

/**
 * Resolve a condition: remove it and award the catalog-specified Beats. For
 * Tilts (zero Beats) the call is equivalent to `removeCondition`. Returns
 * the updated sheet plus the number of Beats awarded.
 *
 * If the key is not currently on the sheet, this is a no-op:
 * `{ sheet, beatsAwarded: 0 }`.
 */
export function resolveCondition(
  sheet: CofdSheet,
  key: string,
): { sheet: CofdSheet; beatsAwarded: number; arcane: boolean } {
  const k = key.toLowerCase().trim();
  if (!hasCondition(sheet, k)) {
    return { sheet, beatsAwarded: 0, arcane: false };
  }
  const entry = lookupCondition(k);
  // Pull the active condition off the list first.
  const removed = removeCondition(sheet, k);
  const award = entry?.beats ?? 0;
  // M5 keeps Condition Beats Standard; M6 may override.
  const arcane = false;
  if (award <= 0) {
    return { sheet: removed, beatsAwarded: 0, arcane };
  }
  const out = addBeats(removed, award, arcane);
  return { sheet: out, beatsAwarded: award, arcane };
}
