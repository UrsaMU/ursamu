/**
 * @module
 *
 * Back-compat barrel for dictionary, stats, support, roller, and
 * sheet helpers. Prefer importing from `@ursamu/cofd-plugin` for the
 * plugin, or deep `src/` paths in monorepo checkouts.
 *
 * @example
 * ```ts
 * // In-repo / tests only — not a public JSR subpath unless mapped:
 * import { /* sheet helpers *\/ } from "./cofd.ts";
 * ```
 */

export * from "./src/dictionary/index.ts";
export * from "./src/stats/index.ts";
export * from "./src/support/index.ts";
export * from "./src/roller/index.ts";
export * from "./src/sheet/index.ts";
