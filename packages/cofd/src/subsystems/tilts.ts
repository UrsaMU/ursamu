// Tilts subsystem -- pure functions over CofdSheet.tilts.
//
// Tilts are scene-bound circumstances. Personal Tilts attach to a single
// character; Environmental Tilts affect a whole scene but are still tracked
// per-character (v1 -- no scene-level DBO). Resolving or removing a Tilt
// awards zero Beats (CoFD 2e core p.282). End-of-scene cleanup is a single
// /clear sweep.

import type { CofdSheet, TiltInstance } from "../stats/sheet.ts";

export type TiltScope = "personal" | "environmental";

export interface TiltCatalogEntry {
  name: string;
  scope: TiltScope;
  description: string;
  effect: string;
  causing: string;
  ending: string;
}

const catalogUrl = new URL("../../resources/tilts.json", import.meta.url);

/** Catalog of every known Tilt, keyed by lowercase-kebab slug. */
export const TILTS: Record<string, TiltCatalogEntry> = JSON.parse(
  Deno.readTextFileSync(catalogUrl),
);

/** Returns the catalog entry for a key, or undefined if unknown. */
export function lookupTilt(key: string): TiltCatalogEntry | undefined {
  if (!key) return undefined;
  return TILTS[key.toLowerCase().trim()];
}

/** True when the sheet already has an active tilt with this key. */
export function hasTilt(sheet: CofdSheet, key: string): boolean {
  const k = key.toLowerCase().trim();
  const list = sheet.tilts ?? [];
  return list.some((t) => t.key === k);
}

/**
 * Add a tilt by key. Returns a new sheet. No-op if the catalog key is
 * unknown or already present (uniqueness by key).
 */
export function addTilt(sheet: CofdSheet, key: string, note?: string): CofdSheet {
  const k = key.toLowerCase().trim();
  if (!lookupTilt(k)) return sheet;
  const list = sheet.tilts ?? [];
  if (list.some((t) => t.key === k)) return sheet;
  const entry: TiltInstance = note ? { key: k, note } : { key: k };
  return { ...sheet, tilts: [...list, entry] };
}

/** Remove a tilt by key. Awards no Beats (CoFD 2e core p.282). */
export function removeTilt(sheet: CofdSheet, key: string): CofdSheet {
  const k = key.toLowerCase().trim();
  const list = sheet.tilts ?? [];
  const next = list.filter((t) => t.key !== k);
  if (next.length === list.length) return sheet;
  return { ...sheet, tilts: next };
}

/** End-of-scene sweep -- clears every active tilt. Awards no Beats. */
export function clearTilts(sheet: CofdSheet): CofdSheet {
  if (!sheet.tilts || sheet.tilts.length === 0) return sheet;
  return { ...sheet, tilts: [] };
}
