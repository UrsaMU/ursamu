/**
 * @ursamu/builder — World-building commands and REST API.
 *
 * Provides @create, @destroy, @clone, @chown, @desc, @name, @parent,
 * @moniker, @dig, @open, @link, @unlink, @quota, @examine, format
 * attribute commands, and a REST API at /api/v1/building.
 */

import { gameHooks } from "@ursamu/mush";
import type { IPlugin, SessionEvent } from "@ursamu/mush";

// Register addCmds at module load time (Phase 1)
import "./src/commands/world.ts";
import "./src/commands/describe.ts";
import "./src/commands/exits.ts";
import "./src/commands/quota.ts";
import "./src/commands/examine.ts";

export { buildingRouteHandler } from "./src/routes.ts";

// ── lifecycle hook handlers ────────────────────────────────────────────────────

const onLogin = (_e: SessionEvent): void => {
  // Reserved for future welcome-builder logic
};

// ── plugin ────────────────────────────────────────────────────────────────────

export const builderPlugin: IPlugin = {
  name:        "@ursamu/builder",
  version:     "0.1.0",
  description: "World-building commands and REST API — @dig, @open, @link, @desc, @examine, and more.",

  init: () => {
    gameHooks.on("player:login", onLogin);
    return true;
  },

  remove: () => {
    gameHooks.off("player:login", onLogin);
  },
};

export default builderPlugin;

// Re-export route handler for consumers that want to mount it manually
