/**
 * hooks.ts — gameHooks declaration merging for help system events,
 * plus a typed emit helper that works around external-package emit typing.
 *
 * Other plugins can listen to these events:
 *   import { gameHooks } from "@ursamu/mush";
 *   gameHooks.on("help:miss", ({ topic }) => { ... });
 *
 * Note: declaration merging on GameHookMap only takes effect for type-checked
 * code within this package. For listening (on/off), no augmentation is needed
 * since those methods are typed more loosely than emit.
 */

import { gameHooks } from "@ursamu/mush";
import type { HelpEntry } from "./registry.ts";

declare module "@ursamu/mush" {
  interface GameHookMap {
    /** Fires before a topic lookup. */
    "help:lookup": { topic: string };
    /** Fires when no provider has an entry for the requested topic. */
    "help:miss": { topic: string };
    /** Fires when a DB entry is created or updated. */
    "help:register": { entry: HelpEntry };
  }
}

/**
 * Typed emit wrapper for help system events.
 * Uses `as any` internally to avoid fighting the strict external-package emit typings;
 * the payload shapes are enforced by the overload signatures below.
 */
export function emitHelp(event: "help:lookup" | "help:miss", payload: { topic: string }): void;
export function emitHelp(event: "help:register", payload: { entry: HelpEntry }): void;
export function emitHelp(event: string, payload: unknown): void {
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).emit(event, payload);
}
