// splats/vtm/data/powers/index.ts -- Aggregate + lookup.

import type { IPowerDef } from "./types.ts";
import { PHYSICAL_POWERS } from "./physical.ts";
import { PRESENCE_POWERS } from "./presence.ts";
import { DOMINATE_POWERS } from "./dominate.ts";
import { OBFUSCATE_POWERS } from "./obfuscate.ts";
import { AUSPEX_POWERS } from "./auspex.ts";
import { PROTEAN_POWERS } from "./protean.ts";
import { ANIMALISM_POWERS } from "./animalism.ts";
import { CLAN_POWERS } from "./clan.ts";
import { THAUMATURGY_POWERS } from "./thaumaturgy.ts";
import { NECROMANCY_POWERS } from "./necromancy.ts";

export type { IPowerDef, PowerEffect, PowerResist } from "./types.ts";

export const PHYSICAL_PASSIVES = PHYSICAL_POWERS;

export const ACTIVE_POWERS: readonly IPowerDef[] = [
  ...PRESENCE_POWERS,
  ...DOMINATE_POWERS,
  ...OBFUSCATE_POWERS,
  ...AUSPEX_POWERS,
  ...PROTEAN_POWERS,
  ...ANIMALISM_POWERS,
  ...CLAN_POWERS,
  ...THAUMATURGY_POWERS,
  ...NECROMANCY_POWERS,
];

export const ALL_POWERS: readonly IPowerDef[] = [
  ...PHYSICAL_POWERS,
  ...ACTIVE_POWERS,
];

export function getPower(slugOrName: string): IPowerDef | undefined {
  const q = slugOrName.toLowerCase().trim();
  return ALL_POWERS.find(
    (p) =>
      p.slug === q ||
      p.name.toLowerCase() === q ||
      p.name.toLowerCase().startsWith(q) ||
      p.slug.replace(/-/g, " ") === q,
  );
}

/** Match power from first token(s); longest name/slug wins. */
export function matchPower(
  raw: string,
): { power: IPowerDef; rest: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Exact slug/name first.
  const exact = getPower(trimmed);
  if (exact) return { power: exact, rest: "" };

  const lower = trimmed.toLowerCase();
  let best: IPowerDef | undefined;
  let bestLen = 0;
  for (const p of ALL_POWERS) {
    const candidates = [
      p.slug,
      p.name.toLowerCase(),
      p.slug.replace(/-/g, " "),
    ];
    for (const c of candidates) {
      if (
        lower === c ||
        lower.startsWith(c + " ") ||
        lower.startsWith(c + "=")
      ) {
        if (c.length > bestLen) {
          best = p;
          bestLen = c.length;
        }
      }
    }
  }
  if (!best) {
    // Discipline or path name -> level 1 active if any.
    const head = trimmed.split(/[\s=]/)[0] ?? "";
    const lvl1 = ACTIVE_POWERS.find(
      (p) =>
        p.discipline.toLowerCase() === head.toLowerCase() &&
        p.level === 1 &&
        p.effect !== "passive",
    );
    if (lvl1) {
      const rest = trimmed.slice(head.length).replace(/^[=\s]+/, "");
      return { power: lvl1, rest };
    }
    // Full input as a path name (e.g. "Green Path", "Ash Path").
    const pathL1 = ACTIVE_POWERS.find(
      (p) =>
        p.path &&
        (p.path.toLowerCase() === lower ||
          lower.endsWith(p.path.toLowerCase()) ||
          p.path.toLowerCase().endsWith(lower)) &&
        p.level === 1 &&
        p.effect !== "passive",
    );
    if (pathL1) return { power: pathL1, rest: "" };
    return null;
  }
  const rest = trimmed.slice(bestLen).replace(/^[=\s]+/, "");
  return { power: best, rest };
}

export function powersForDiscipline(discipline: string): IPowerDef[] {
  const d = discipline.toLowerCase();
  return ALL_POWERS.filter((p) => p.discipline.toLowerCase() === d)
    .sort((a, b) => a.level - b.level);
}

export function powersForPath(path: string): IPowerDef[] {
  const q = path.toLowerCase();
  return ALL_POWERS.filter((p) => p.path?.toLowerCase() === q)
    .sort((a, b) => a.level - b.level);
}

/**
 * Dots a character can invoke in a blood-magic path. The primary path
 * always equals the school rating (V20 p.212); secondary paths use dots
 * bought in the path itself, capped at school-1 until the school hits 5.
 */
export function pathDots(
  char: { disciplines?: Record<string, number>; primaryPaths?: Record<string, string> },
  power: IPowerDef,
): number {
  if (!power.path) return discDots(char.disciplines, power.discipline);
  const school = power.discipline.toLowerCase();
  const schoolDots = discDots(char.disciplines, power.discipline);
  const primary = char.primaryPaths?.[school] ??
    (school === "necromancy" ? "Sepulchre Path" : "Path of Blood");
  if (power.path.toLowerCase() === primary.toLowerCase()) return schoolDots;
  const secondary = discDots(char.disciplines, power.path);
  if (schoolDots < 5) return Math.min(secondary, Math.max(0, schoolDots - 1));
  return Math.min(secondary, 5);
}

export function powersKnown(
  discs: Record<string, number>,
  primaryPaths?: Record<string, string>,
): IPowerDef[] {
  const char = { disciplines: discs, primaryPaths };
  return ACTIVE_POWERS.filter((p) => pathDots(char, p) >= p.level);
}

export function discDots(
  discs: Record<string, number> | undefined,
  name: string,
): number {
  if (!discs) return 0;
  const q = name.toLowerCase();
  for (const [k, v] of Object.entries(discs)) {
    if (k.toLowerCase() === q && typeof v === "number") return v;
  }
  return 0;
}
