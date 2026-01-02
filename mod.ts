/**
 * @module ursamu
 * @description The core UrsaMU engine library.
 *
 * This module exports the main entry points for the UrsaMU engine, including
 * the `mu` engine instance, database object creation utilities, and the Telnet server.
 *
 * @example
 * ```ts
 * import { mu } from "@ursamu/ursamu";
 *
 * // Initialize the engine
 * await mu(config);
 * ```
 */

// Export Interfaces
export * from "./src/interfaces/index.ts";

// Export Core Factory/Services
export { createObj } from "./src/services/DBObjs/DBObjs.ts";
export { mu, checkAndCreateSuperuser } from "./src/main.ts";
export { startTelnetServer } from "./src/services/telnet/telnet.ts";

// Hide internal class implementations by not exporting everything

if (import.meta.main) {
  await import("./src/cli/ursamu.ts");
}