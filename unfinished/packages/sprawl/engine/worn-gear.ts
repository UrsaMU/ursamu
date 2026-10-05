/**
 * Worn armor / power-suit effects: fight bonus, stat mods,
 * loadout multipliers. Only active while slot === "worn".
 * (No import from items.ts — avoids circular deps.)
 */
import type {
  SprawlBonusWhen,
  SprawlItemData,
  SprawlStatMod,
  StatKey,
} from "../db/schemas.ts";

function asData(
  // deno-lint-ignore no-explicit-any
  raw: any,
): SprawlItemData | null {
  if (!raw || typeof raw !== "object") return null;
  if ("flags" in raw || raw.state) {
    const d = raw.state?.sprawl_item as SprawlItemData | undefined;
    return d?.slug ? d : null;
  }
  if (typeof raw.slug === "string") {
    return raw as SprawlItemData;
  }
  return null;
}

function labelOf(
  // deno-lint-ignore no-explicit-any
  raw: any,
  d: SprawlItemData,
): string {
  if (raw && typeof raw === "object" && raw.name) {
    return String(raw.name);
  }
  return (d as { name?: string }).name ?? d.slug;
}

export function isWorn(d: SprawlItemData): boolean {
  return (d.slot ?? "carried") === "worn";
}

/** Resolve when this item's combat bonus applies. */
export function resolveBonusWhen(
  d: SprawlItemData,
): SprawlBonusWhen {
  if (d.bonusWhen) return d.bonusWhen;
  if (d.kind === "armor") return "worn";
  return "always";
}

/** True if host combat bonus should count right now. */
export function combatBonusActive(d: SprawlItemData): boolean {
  const when = resolveBonusWhen(d);
  const slot = d.slot ?? "carried";
  if (when === "always" || when === "any") return true;
  if (when === "worn") return slot === "worn";
  if (when === "wielded") return slot === "wielded";
  return true;
}

/**
 * Loadout capacity after worn gear (exo-frame doubles max).
 * Takes the highest loadoutMult among worn items, then adds
 * any loadoutBonus flats.
 */
export function effectiveLoadoutMax(
  base: number,
  // deno-lint-ignore no-explicit-any
  items: ReadonlyArray<any>,
): number {
  let mult = 1;
  let flat = 0;
  for (const raw of items) {
    const d = asData(raw);
    if (!d || !isWorn(d)) continue;
    const m = Number(d.loadoutMult ?? 1);
    if (Number.isFinite(m) && m > mult) mult = m;
    const b = Number(d.loadoutBonus ?? 0);
    if (Number.isFinite(b) && b !== 0) flat += b;
  }
  return Math.floor(base * mult) + flat;
}

/** Stat bonuses from worn items (power armor, coil suit). */
export function wornStatBonuses(
  // deno-lint-ignore no-explicit-any
  items: ReadonlyArray<any>,
  stat: StatKey | string,
): { total: number; parts: string[] } {
  const want = String(stat).toLowerCase();
  let total = 0;
  const parts: string[] = [];
  for (const raw of items) {
    const d = asData(raw);
    if (!d || !isWorn(d) || !d.statMods?.length) continue;
    const name = labelOf(raw, d);
    for (const sm of d.statMods) {
      if (String(sm.stat).toLowerCase() !== want) continue;
      const m = Number(sm.mod) || 0;
      if (!m) continue;
      total += m;
      const sign = m > 0 ? "+" : "";
      parts.push(
        `${name} ${shortStat(want)} ${sign}${m}`,
      );
    }
  }
  return { total, parts };
}

/** Normalize catalog/seed statMods into schema shape. */
export function parseStatMods(
  raw: unknown,
  legacyStat?: unknown,
  legacyMod?: unknown,
): SprawlStatMod[] | undefined {
  const out: SprawlStatMod[] = [];
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const stat = String(r.stat ?? "").toLowerCase();
      const mod = Number(r.mod ?? 0);
      if (!stat || !mod) continue;
      out.push({ stat, mod });
    }
  }
  if (!out.length && legacyStat != null && legacyMod != null) {
    const mod = Number(legacyMod);
    if (mod) {
      out.push({
        stat: String(legacyStat).toLowerCase(),
        mod,
      });
    }
  }
  return out.length ? out : undefined;
}

export function shortStat(stat: string): string {
  const s = stat.toLowerCase();
  const map: Record<string, string> = {
    morphology: "Mor",
    equilibrium: "Equ",
    reaction: "Rea",
    cognition: "Cog",
    affinity: "Aff",
  };
  return map[s] ?? stat.slice(0, 3);
}
