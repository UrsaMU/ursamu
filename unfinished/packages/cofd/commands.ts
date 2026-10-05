/**
 * @module
 *
 * Side-effect entry that registers all CoFD `addCmd` handlers and
 * re-exports a few command executors for tests and shims.
 *
 * Importing this module (or `index.ts`) is enough to load commands.
 *
 * @example
 * ```ts
 * import "@ursamu/cofd-plugin/commands.ts"; // if subpath mapped
 * // Prefer: import "@ursamu/cofd-plugin" which loads this for you.
 * ```
 */

import "./src/commands/register.ts";

export {
  sheetExec,
  sheetSetExec,
  rollExec,
  cgExec,
} from "./src/commands/index.ts";
