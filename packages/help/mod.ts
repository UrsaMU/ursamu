/**
 * @module @ursamu/help
 * @description API-first help system (stable 1.0).
 *
 * Layout chrome prefers `game.layout.*` mushcode when the engine
 * supports it; otherwise TinyMUX plushelp-style dash rules.
 * Stable surface: docs/STABLE.md.
 *
 * ## Quick start
 *
 * ```ts
 * import { registerHelpDir } from "@ursamu/help";
 *
 * export const plugin: IPlugin = {
 *   name: "myplugin",
 *   init: () => {
 *     // Prefer URL (works for local file: and JSR https://)
 *     registerHelpDir(
 *       new URL("./help", import.meta.url),
 *       "myplugin",
 *     );
 *     return true;
 *   },
 * };
 * ```
 *
 * ## REST API
 *
 * ```
 * GET    /api/v1/help
 * GET    /api/v1/help/:topic
 * GET    /api/v1/help/:topic?format=md
 * POST   /api/v1/help/:topic        (admin JWT)
 * DELETE /api/v1/help/:topic        (admin JWT)
 * ```
 */

// Plugin bootstrap
export { plugin } from "./src/index.ts";

// Registry — for advanced use (custom providers, direct lookup)
export {
  helpRegistry,
  registerHelpEntry,
  slugify,
} from "./src/registry.ts";
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
