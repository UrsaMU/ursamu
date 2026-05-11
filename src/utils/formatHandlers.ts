/**
 * Pluggable format handlers for look-side display attributes
 * (NAMEFORMAT / DESCFORMAT / CONFORMAT / EXITFORMAT).
 *
 * Resolution priority inside `execLook`:
 *   1. Softcode attribute on the target (e.g. `@nameformat`) — highest.
 *   2. Plugin-registered handler for the slot — middle.
 *   3. Built-in default rendering — lowest.
 *
 * Plugins call `registerFormatHandler(slot, fn)` from their `init()` and
 * `unregisterFormatHandler(slot, fn)` from their `remove()`.
 */
import type { IUrsamuSDK, IDBObj } from "../@types/UrsamuSDK.ts";

export type FormatSlot =
  | "NAMEFORMAT"
  | "DESCFORMAT"
  | "CONFORMAT"
  | "EXITFORMAT"
  | "WHOFORMAT"
  | "WHOROWFORMAT"
  | "PSFORMAT" | "PSROWFORMAT";

/**
 * Plugin handler signature.
 * Return a string to override the default rendering; return null to fall through.
 */
export type FormatHandler = (
  u: IUrsamuSDK,
  target: IDBObj,
  defaultArg: string,
) => Promise<string | null> | string | null;

const registry = new Map<FormatSlot, FormatHandler[]>();

export function registerFormatHandler(slot: FormatSlot, fn: FormatHandler): void {
  const list = registry.get(slot) ?? [];
  list.push(fn);
  registry.set(slot, list);
}

export function unregisterFormatHandler(slot: FormatSlot, fn: FormatHandler): void {
  const list = registry.get(slot);
  if (!list) return;
  const idx = list.indexOf(fn);
  if (idx >= 0) list.splice(idx, 1);
}

/** First registered handler that returns a non-null string wins. */
export async function runPluginFormatHandlers(
  slot: FormatSlot,
  u: IUrsamuSDK,
  target: IDBObj,
  defaultArg: string,
): Promise<string | null> {
  const list = registry.get(slot);
  if (!list || list.length === 0) return null;
  for (const fn of list) {
    try {
      const out = await fn(u, target, defaultArg);
      if (out != null) return out;
    } catch (e: unknown) {
      // Handler error → fall through to next handler / built-in. We log so
      // operators can see plugin bugs (silent swallowing was L1 in TDD audit).
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[format-handler ${slot}] plugin handler threw: ${msg}`);
    }
  }
  return null;
}

/** Test-only: drop all registered handlers. */
export function _clearFormatHandlers(): void {
  registry.clear();
}
