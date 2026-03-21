/**
 * @module chargen
 * @description The UrsaMU Character Generation plugin.
 *
 * Provides the persistent chargen application database, typed lifecycle hooks,
 * and the `IChargenApp` data type.
 *
 * @example
 * ```ts
 * import { chargenHooks } from "@ursamu/ursamu/chargen";
 *
 * chargenHooks.on("chargen:submitted", (app) => {
 *   console.log(`New chargen application from player ${app.data.playerId}`);
 * });
 * ```
 */

export { default as chargenPlugin } from "./index.ts";
export { chargenHooks } from "./hooks.ts";
export type { IChargenApp } from "./db.ts";
