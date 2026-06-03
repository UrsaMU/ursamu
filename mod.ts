/**
 * @module @ursamu/ursamu
 *
 * Backwards-compatibility shim. All exports now come from @ursamu/mush,
 * which re-exports everything from @ursamu/core.
 *
 * New projects should import from "@ursamu/mush" directly.
 *
 * @example
 * ```ts
 * // Legacy — still works
 * import { mu } from "@ursamu/ursamu";
 *
 * // Preferred
 * import { mu } from "@ursamu/mush";
 * ```
 */

export * from "@ursamu/mush";

// mu() / initializeEngine — the primary engine entry point lives in src/main.ts.
// Re-exported here so existing game projects using `import { mu } from "@ursamu/ursamu"`
// continue to work without changes.
export { mu, initializeEngine, checkAndCreateSuperuser } from "./src/main.ts";
export { startTelnetServer } from "./src/services/telnet/mod.ts";
export { createObj } from "./src/services/DBObjs/DBObjs.ts";
