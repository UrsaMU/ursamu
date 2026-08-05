// Per-realm MapConfig registry. Siblings register a themed config under a
// realm slug; the renderer resolves the right config at render time. Falls
// back to defaultMapConfig when no realm-specific config is present.
//
// TopologyEngine is cached per realm so the renderer doesn't rebuild noise
// instances on every call. Base snapshots keep theme packs intact when
// staff legend overrides are applied on top.

import { defaultMapConfig } from "./config.default.ts";
import { DEFAULT_REALM } from "./schemas.ts";
import type { MapConfig } from "./schemas.ts";
import { createTopologyEngine, type TopologyEngine } from "./topology.ts";

const configs = new Map<string, MapConfig>();
const bases = new Map<string, MapConfig>();
const engines = new Map<string, TopologyEngine>();

/** Deep-clone a MapConfig via JSON (configs are plain data). */
export function cloneMapConfig(cfg: MapConfig): MapConfig {
  return JSON.parse(JSON.stringify(cfg)) as MapConfig;
}

/** Register a MapConfig for a realm slug. Replaces any prior registration. */
export function registerMapConfig(realmId: string, cfg: MapConfig): void {
  if (!realmId) realmId = DEFAULT_REALM;
  const snap = cloneMapConfig(cfg);
  bases.set(realmId, cloneMapConfig(cfg));
  configs.set(realmId, snap);
  engines.delete(realmId);
}

/**
 * Replace the *active* config without changing the theme base snapshot.
 * Used when applying staff legend/biome glyph overrides.
 */
export function setActiveMapConfig(
  realmId: string,
  cfg: MapConfig,
): void {
  if (!realmId) realmId = DEFAULT_REALM;
  configs.set(realmId, cloneMapConfig(cfg));
  engines.delete(realmId);
}

/** Remove a registered MapConfig (and its cached engine). */
export function unregisterMapConfig(realmId: string): void {
  configs.delete(realmId);
  bases.delete(realmId);
  engines.delete(realmId);
}

/**
 * Theme/base config for a realm (pre-override). Falls back to
 * defaultMapConfig when the realm was never registered.
 */
export function getBaseMapConfig(
  realmId: string | undefined,
): MapConfig {
  if (!realmId) return defaultMapConfig;
  return bases.get(realmId) ?? defaultMapConfig;
}

/**
 * Resolve the MapConfig for a realm. Returns the registered config or
 * `defaultMapConfig` when none is registered for that slug.
 */
export function getMapConfig(realmId: string | undefined): MapConfig {
  if (!realmId) return defaultMapConfig;
  return configs.get(realmId) ?? defaultMapConfig;
}

/**
 * Get (or build and cache) the TopologyEngine for a realm. Cached per slug;
 * `registerMapConfig` / `unregisterMapConfig` invalidate the cache for that
 * slug only.
 */
export function getTopologyEngine(realmId: string | undefined): TopologyEngine {
  const slug = realmId || DEFAULT_REALM;
  const hit = engines.get(slug);
  if (hit) return hit;
  const engine = createTopologyEngine(getMapConfig(slug));
  engines.set(slug, engine);
  return engine;
}

/** Test-only: drop all registrations + caches. */
export function _clearMapConfigs(): void {
  configs.clear();
  bases.clear();
  engines.clear();
}

/** Diagnostic: list registered realm slugs (does not include the default fallback). */
export function listRegisteredRealms(): string[] {
  return [...configs.keys()];
}
