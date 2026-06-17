// Themed spawn tables for +zone/populate theme=<theme>.
//
// Each theme is a weighted list of archetypes drawn from the NPC archetype
// registry (src/npc/archetypes.ts). Picks are weighted-random with
// replacement, so the same archetype can be selected multiple times.

import { getArchetype } from "../npc/archetypes.ts";

export type ThemeKey = "forest" | "city" | "urban-decay" | "sewer" | "ruins";
export type SpawnSize = "small" | "medium" | "large";

export interface ThemeEntry {
  archetype: string; // must be a real archetype key
  weight: number; // pick weight (higher = more common)
  aggro: "passive" | "territorial" | "hunter";
}

// All archetypes referenced below exist in src/npc/archetypes.ts:
// thug, cultist, soldier, beast, lieutenant, boss, hunter, professional,
// occultist, ghost, spirit, mastermind.
export const THEMES: Record<ThemeKey, ThemeEntry[]> = {
  forest: [
    { archetype: "beast", weight: 6, aggro: "territorial" },
    { archetype: "spirit", weight: 3, aggro: "passive" },
    { archetype: "hunter", weight: 2, aggro: "hunter" },
    { archetype: "thug", weight: 1, aggro: "passive" },
  ],
  city: [
    { archetype: "thug", weight: 6, aggro: "territorial" },
    { archetype: "professional", weight: 3, aggro: "territorial" },
    { archetype: "soldier", weight: 2, aggro: "territorial" },
    { archetype: "lieutenant", weight: 1, aggro: "territorial" },
  ],
  "urban-decay": [
    { archetype: "thug", weight: 5, aggro: "hunter" },
    { archetype: "cultist", weight: 3, aggro: "hunter" },
    { archetype: "occultist", weight: 2, aggro: "territorial" },
    { archetype: "ghost", weight: 2, aggro: "hunter" },
  ],
  sewer: [
    { archetype: "beast", weight: 5, aggro: "territorial" },
    { archetype: "thug", weight: 3, aggro: "territorial" },
    { archetype: "cultist", weight: 2, aggro: "territorial" },
    { archetype: "spirit", weight: 1, aggro: "territorial" },
  ],
  ruins: [
    { archetype: "ghost", weight: 5, aggro: "territorial" },
    { archetype: "spirit", weight: 3, aggro: "territorial" },
    { archetype: "occultist", weight: 2, aggro: "territorial" },
    { archetype: "cultist", weight: 2, aggro: "territorial" },
    { archetype: "beast", weight: 1, aggro: "territorial" },
  ],
};

// Runtime-registered themes. Populated via the REST endpoint
// POST /api/v1/cofd/themes (staff-only). Not persisted across server restart.
const RUNTIME_THEMES: Record<string, ThemeEntry[]> = {};

const THEME_KEY_RE = /^[a-z0-9-]{2,32}$/;
const VALID_AGGRO = new Set(["passive", "territorial", "hunter"]);

export function registerCustomTheme(
  key: string,
  entries: ThemeEntry[],
): { ok: boolean; reason?: string } {
  if (typeof key !== "string" || !THEME_KEY_RE.test(key)) {
    return { ok: false, reason: "invalid key format" };
  }
  if ((THEMES as Record<string, unknown>)[key] !== undefined) {
    return { ok: false, reason: "cannot override builtin theme" };
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, reason: "entries must be a non-empty array" };
  }
  if (entries.length > 16) {
    return { ok: false, reason: "too many entries (max 16)" };
  }
  for (const e of entries) {
    if (!e || typeof e !== "object") {
      return { ok: false, reason: "entry must be an object" };
    }
    if (typeof e.archetype !== "string" || !getArchetype(e.archetype)) {
      return { ok: false, reason: `unknown archetype: ${String(e?.archetype)}` };
    }
    if (typeof e.weight !== "number" || e.weight < 1 || e.weight > 100) {
      return { ok: false, reason: "weight must be a number in [1,100]" };
    }
    if (typeof e.aggro !== "string" || !VALID_AGGRO.has(e.aggro)) {
      return { ok: false, reason: "aggro must be passive|territorial|hunter" };
    }
  }
  RUNTIME_THEMES[key] = entries.map((e) => ({
    archetype: e.archetype,
    weight: e.weight,
    aggro: e.aggro,
  }));
  return { ok: true };
}

export function themeKeys(): string[] {
  const out = new Set<string>(Object.keys(THEMES));
  for (const k of Object.keys(RUNTIME_THEMES)) out.add(k);
  return Array.from(out).sort();
}

function sizeToCount(size: SpawnSize): number {
  switch (size) {
    case "small":
      return 3;
    case "medium":
      return 6;
    case "large":
      return 12;
  }
}

function pickWeighted(entries: ThemeEntry[]): ThemeEntry {
  const total = entries.reduce((s, e) => s + Math.max(0, e.weight), 0);
  if (total <= 0) return entries[0];
  let r = Math.random() * total;
  for (const e of entries) {
    r -= Math.max(0, e.weight);
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

export function pickThemeSpawns(
  theme: ThemeKey | string,
  size: SpawnSize,
): Array<{ archetype: string; aggro: "passive" | "territorial" | "hunter" }> {
  const entries = (THEMES as Record<string, ThemeEntry[]>)[theme] ??
    RUNTIME_THEMES[theme];
  if (!entries || entries.length === 0) return [];
  const n = sizeToCount(size);
  const out: Array<
    { archetype: string; aggro: "passive" | "territorial" | "hunter" }
  > = [];
  for (let i = 0; i < n; i++) {
    const e = pickWeighted(entries);
    out.push({ archetype: e.archetype, aggro: e.aggro });
  }
  return out;
}
