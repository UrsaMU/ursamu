// Region resolution. Replaces the legacy flat `sectors` map with a nested
// region model: a coord can match many regions; the deepest match wins. A
// "depth" here is the longest chain of `parent` links resolvable inside the
// config — that's why a city inside a country inside a continent surfaces the
// city name (and the full chain for header rendering).

import type { Coord, MapConfig, Region } from "./schemas.ts";

const inAabb = (c: Coord, aabb: [Coord, Coord]): boolean => {
  const [lo, hi] = aabb;
  return (
    c.x >= lo.x && c.x <= hi.x &&
    c.y >= lo.y && c.y <= hi.y &&
    c.z >= lo.z && c.z <= hi.z
  );
};

/** Resolve effective region list from a config, auto-converting `sectors`. */
export function effectiveRegions(cfg: MapConfig): Region[] {
  if (cfg.regions && cfg.regions.length > 0) return cfg.regions;
  if (!cfg.sectors) return [];
  return Object.entries(cfg.sectors).map(([slug, s]) => ({
    slug, name: s.name, aabb: s.aabb,
  }));
}

function depth(region: Region, byslug: Map<string, Region>, seen = new Set<string>()): number {
  if (!region.parent) return 0;
  if (seen.has(region.slug)) return 0; // cycle guard
  seen.add(region.slug);
  const p = byslug.get(region.parent);
  if (!p) return 1;
  return 1 + depth(p, byslug, seen);
}

/**
 * Return the deepest region that contains `coord`. "Deepest" = longest parent
 * chain. Ties broken by registration order in the config (first wins).
 */
export function getRegion(cfg: MapConfig, coord: Coord): Region | null {
  const list = effectiveRegions(cfg);
  if (list.length === 0) return null;
  const byslug = new Map(list.map((r) => [r.slug, r]));
  let best: Region | null = null;
  let bestDepth = -1;
  for (const r of list) {
    if (!inAabb(coord, r.aabb)) continue;
    const d = depth(r, byslug);
    if (d > bestDepth) {
      best = r;
      bestDepth = d;
    }
  }
  return best;
}

/**
 * Return the full deepest-to-outermost region chain for a coord. Useful for
 * rendering "City — Country — Continent" labels.
 */
export function getRegionPath(cfg: MapConfig, coord: Coord): Region[] {
  const deepest = getRegion(cfg, coord);
  if (!deepest) return [];
  const list = effectiveRegions(cfg);
  const byslug = new Map(list.map((r) => [r.slug, r]));
  const path: Region[] = [];
  let cur: Region | undefined = deepest;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.slug)) {
    path.push(cur);
    seen.add(cur.slug);
    cur = cur.parent ? byslug.get(cur.parent) : undefined;
  }
  return path;
}
