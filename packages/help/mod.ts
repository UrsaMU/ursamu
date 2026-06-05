/**
 * @module @ursamu/help
 * @description API-first help system framework for UrsaMU.
 *
 * ## Quick start
 *
 * Install the plugin in your game's plugin manifest, then optionally
 * register your plugin's help directory from your plugin's init():
 *
 * ```ts
 * import { registerHelpDir } from "@ursamu/help";
 *
 * export const plugin: IPlugin = {
 *   name: "myplugin",
 *   init: () => {
 *     registerHelpDir(new URL("./help", import.meta.url).pathname, "myplugin");
 *     return true;
 *   },
 * };
 * ```
 *
 * ## REST API
 *
 * ```
 * GET    /api/v1/help               → { sections, topics }
 * GET    /api/v1/help/:topic        → { entry }
 * GET    /api/v1/help/:topic?format=md  → raw markdown
 * POST   /api/v1/help/:topic        → create/update (admin, auth required)
 * DELETE /api/v1/help/:topic        → delete       (admin, auth required)
 * ```
 */

// Plugin bootstrap
export { plugin } from "./src/index.ts";

// Registry — for advanced use (custom providers, direct lookup)
export { helpRegistry, registerHelpEntry } from "./src/registry.ts";
export type { HelpEntry, HelpProvider, HelpSource } from "./src/registry.ts";

// File provider registration — for per-plugin help directories
export { registerHelpDir, bustCache } from "./src/providers/file.ts";

// DB operations — for programmatic help entry management
export { upsertEntry, deleteEntry } from "./src/providers/database.ts";
export type { IHelpDbEntry } from "./src/providers/database.ts";

// Providers — for custom provider implementations
export { CommandProvider } from "./src/providers/command.ts";
export { FileProvider } from "./src/providers/file.ts";
export { DbProvider } from "./src/providers/database.ts";
