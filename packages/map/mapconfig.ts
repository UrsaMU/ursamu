// Per-realm MapConfig registry. Siblings register a themed config under a
// realm slug; the renderer resolves the right config at render time. Falls
// back to defaultMapConfig when no realm-specific config is present.
//
// TopologyEngine is cached per realm so the renderer doesn't rebuild noise
// instances on every call.

import { defaultMapConfig } from "./config.default.ts";
import { DEFAULT_REALM } from "./schemas.ts";
import type { MapConfig } from "./schemas.ts";
import { createTopologyEngine, type TopologyEngine } from "./topology.ts";

const configs = new Map<string, MapConfig>();
const engines = new Map<string, TopologyEngine>();

/** Register a MapConfig for a realm slug. Replaces any prior registration. */
export function registerMapConfig(realmId: string, cfg: MapConfig): void {
  if (!realmId) realmId = DEFAULT_REALM;
  configs.set(realmId, cfg);
  engines.delete(realmId);
}

/** Remove a registered MapConfig (and its cached engine). */
export function unregisterMapConfig(realmId: string): void {
  configs.delete(realmId);
  engines.delete(realmId);
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
  engines.clear();
}

/** Diagnostic: list registered realm slugs (does not include the default fallback). */
export function listRegisteredRealms(): string[] {
  return [...configs.keys()];
}
