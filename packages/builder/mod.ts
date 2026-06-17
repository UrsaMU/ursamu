/**
 * @ursamu/builder — World-building commands and REST API.
 *
 * Provides @create, @destroy, @clone, @chown, @desc, @name, @parent,
 * @moniker, @dig, @open, @link, @unlink, @quota, @examine, format
 * attribute commands, and a REST API at /api/v1/building.
 */

import { gameHooks, registerScript, registerPluginRoute } from "@ursamu/mush";
import type { IPlugin, SessionEvent } from "@ursamu/mush";

// Register addCmds at module load time (Phase 1)
import "./src/commands/world.ts";
import "./src/commands/describe.ts";
import "./src/commands/exits.ts";
import "./src/commands/quota.ts";
import "./src/commands/examine.ts";
import { registerBatchBuildCmd } from "./src/commands/batchbuild.ts";
import { buildingRouteHandler } from "./src/routes.ts";

export { buildingRouteHandler } from "./src/routes.ts";

// ─── script names bundled by this plugin ──────────────────────────────────────

const SCRIPTS = [
  "dig", "open", "link", "unlink", "clone", "destroy",
  "describe", "examine", "name", "set", "setAttr",
  "lock", "quota", "parent", "wipe", "oemit",
  "zone",
] as const;

// ─── load script content at init time ─────────────────────────────────────────

async function loadScript(name: string): Promise<string | null> {
  const base = new URL(`./src/scripts/${name}.ts`, import.meta.url);
  try {
    if (base.protocol === "file:") {
      const { fromFileUrl } = await import("@std/path");
      return await Deno.readTextFile(fromFileUrl(base));
    }
    const res = await fetch(base.toString());
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

// ─── lifecycle hook handlers ───────────────────────────────────────────────────

const onLogin = (_e: SessionEvent): void => {
  // Reserved for future welcome-builder logic
};

// ─── plugin ────────────────────────────────────────────────────────────────────

export const builderPlugin: IPlugin = {
  name:        "builder",
  version:     "1.3.0",
  description: "World-building commands and REST API — @dig, @open, @link, @desc, @examine, and more.",

  init: async () => {
    // Register all builder scripts — they override engine bundled copies
    for (const name of SCRIPTS) {
      const content = await loadScript(name);
      if (content) {
        registerScript(name, content);
      } else {
        console.warn(`[builder-plugin] Could not load script: ${name}`);
      }
    }

    // Register batch build commands
    registerBatchBuildCmd();

    // Mount REST API
    registerPluginRoute("/api/v1/building", buildingRouteHandler);

    // Soft-register help directory with @ursamu/help (optional dependency)
    try {
      const { registerHelpDir } = await import("@ursamu/help");
      registerHelpDir(new URL("./help", import.meta.url).pathname, "building");
    } catch {
      // @ursamu/help not installed
    }

    gameHooks.on("player:login", onLogin);
    return true;
  },

  remove: () => {
    gameHooks.off("player:login", onLogin);
  },
};

export default builderPlugin;
