// Map plugin entry point. Phase 1: importing ./commands.ts registers +map.
// Phase 2: init() wires DESCFORMAT into the format-attribute pipeline.
// Phase 3: init() schedules periodic fog-memory pruning.

import type { IPlugin } from "ursamu";
import {
  flags,
  registerFormatHandler,
  unregisterFormatHandler,
} from "ursamu";
import { registerHelpDir } from "@ursamu/help/register";

import { descFormatHandler } from "./format.ts";
import { pruneStaleMemory } from "./fog.ts";
import { registerMapRoutes } from "./routes.ts";
import { DEFAULT_REALM, MAP_CAPABLE_FLAG } from "./schemas.ts";
import { getMapConfig, registerMapConfig } from "./mapconfig.ts";
import { hedgeMapConfig } from "./config/hedge.ts";
import { getPluginConfigSync } from "./plugin-config.ts";
import { pruneOrphanEntities } from "./entities.ts";
import { applyAllStoredOverrides } from "./legend-overrides.ts";
import {
  registerMapStaffNav,
  unregisterMapStaffNav,
} from "./staff-nav-bridge.ts";
import "./commands.ts";

/** Single-letter code unused by core flags (see mush flags.ts). */
const MAP_CAPABLE_CODE = "M";

// Public extension API surfaced for sibling plugins.
export {
  E,
  type DirectionDelta,
  entityStep,
  type EntityStepOptions,
  type EntityStepResult,
  type GuardResult,
  type MoveContext,
  type MoveGuard,
  type MoveResult,
  moveCoord,
  N,
  NE,
  NW,
  registerMoveGuard,
  runMoveGuards,
  S,
  SE,
  STEP_DIRECTIONS,
  SW,
  unregisterMoveGuard,
  W,
} from "./move.ts";

export { registerDefaultCommands } from "./commands.ts";

export {
  getPluginConfigSync,
  invalidatePluginConfigCache,
  type MapPluginConfig,
  resolveDefaultCommandToggle,
} from "./plugin-config.ts";

// Re-export helpers siblings need when building custom commands.
export {
  countEntities,
  getActiveEntity,
  getEntity,
  listAllEntities,
  moveEntity,
  pruneOrphanEntities,
  setEntity,
} from "./entities.ts";
export {
  clearOverlay,
  countOverlays,
  getOverlay,
  getOverlaysInRegion,
  setOverlay,
} from "./state.ts";
export { hedgeMapConfig } from "./config/hedge.ts";
export { chunkKey, chunkKeysInRegion, CHUNK_SIZE } from "./spatial.ts";

export {
  type InfoLineFn,
  registerInfoLine,
  registerRenderLayer,
  type RenderExtensionInput,
  type RenderLayerFn,
  unregisterInfoLine,
  unregisterRenderLayer,
} from "./extensions.ts";

export {
  getMapConfig,
  getTopologyEngine,
  listRegisteredRealms,
  registerMapConfig,
  unregisterMapConfig,
} from "./mapconfig.ts";

export {
  effectiveRegions,
  getRegion,
  getRegionPath,
} from "./regions.ts";

export {
  findPath,
  type FindPathOptions,
  getTraversalCost,
} from "./pathfinding.ts";

export {
  migrateFogKeys,
  type MigrationReport,
  migrateOverlayKeys,
  migrateToV3,
} from "./migrate.ts";

const PRUNE_INTERVAL_MS = 15 * 60 * 1000;

let pruneTimer: ReturnType<typeof setInterval> | undefined;

const runPrune = async (): Promise<void> => {
  try {
    await pruneStaleMemory();
  } catch (err) {
    console.error("[map-plugin] pruneStaleMemory failed:", err);
  }
};

function applyThemeFromConfig(): void {
  const cfg = getPluginConfigSync();
  const theme = (cfg.theme ?? "default").toLowerCase();
  const realm = cfg.realm?.trim() || DEFAULT_REALM;
  if (theme === "hedge" || theme === "court") {
    registerMapConfig(realm, hedgeMapConfig);
    console.log(
      `[map] theme="${theme}" registered on realm="${realm}"`,
    );
  } else {
    // Snapshot default as base so legend overrides have a home.
    registerMapConfig(realm, getMapConfig(realm));
  }
}

const mapPlugin: IPlugin = {
  name: "map",
  version: "3.2.1",
  description:
    "Procedural sector map — vehicles, fog, overlays, realms.",
  dependencies: [
    { name: "help", version: ">=1.0.0" },
  ],

  init: () => {
    // So builders can @set <vehicle>=map-capable (Tags drops unknown names).
    if (!flags.exists(MAP_CAPABLE_FLAG)) {
      flags.add({
        name: MAP_CAPABLE_FLAG,
        code: MAP_CAPABLE_CODE,
        lock: "builder+",
      });
    }
    applyThemeFromConfig();
    void applyAllStoredOverrides().catch((err: unknown) => {
      console.error("[map-plugin] legend overrides failed:", err);
    });
    registerHelpDir(new URL("./help", import.meta.url), "map");
    // Prepend so we run before other DESCFORMAT wrappers (e.g. CoFD
    // which always returns a wrapped default desc and would starve us).
    registerFormatHandler("DESCFORMAT", descFormatHandler, {
      prepend: true,
    });
    registerMapRoutes();
    void registerMapStaffNav();
    if (pruneTimer !== undefined) {
      clearInterval(pruneTimer);
      pruneTimer = undefined;
    }
    void runPrune();
    void pruneOrphanEntities().catch((err: unknown) => {
      console.error("[map-plugin] orphan prune failed:", err);
    });
    pruneTimer = setInterval(() => {
      void runPrune();
      void pruneOrphanEntities().catch(() => {});
    }, PRUNE_INTERVAL_MS);
    return true;
  },

  remove: () => {
    unregisterFormatHandler("DESCFORMAT", descFormatHandler);
    void unregisterMapStaffNav();
    if (pruneTimer !== undefined) {
      clearInterval(pruneTimer);
      pruneTimer = undefined;
    }
  },
};

export default mapPlugin;
