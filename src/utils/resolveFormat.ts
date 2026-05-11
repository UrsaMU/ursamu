/**
 * Resolve a format slot in priority order:
 *   1. Softcode attribute on the target (e.g. `@nameformat`) — evaluated via
 *      softcodeService.runSoftcode.
 *   2. Plugin-registered handler for the slot
 *      (see `runPluginFormatHandlers`).
 *   3. null → caller falls back to its own built-in default rendering.
 *
 * Failures are fail-closed: a softcode throw falls through to the plugin
 * handler chain; a plugin handler throw is swallowed by
 * `runPluginFormatHandlers` and the next handler runs.
 */
import type { IDBObj, IUrsamuSDK } from "../@types/UrsamuSDK.ts";
import { softcodeService } from "../services/Softcode/index.ts";
import { runPluginFormatHandlers, type FormatSlot } from "./formatHandlers.ts";

export type { FormatSlot } from "./formatHandlers.ts";

export async function resolveFormat(
  u: IUrsamuSDK,
  target: IDBObj,
  slot: FormatSlot,
  defaultArg: string,
): Promise<string | null> {
  // 1. softcode attribute
  if (u.attr?.get) {
    try {
      const raw = await u.attr.get(target.id, slot);
      if (raw != null) {
        return await softcodeService.runSoftcode(raw, {
          actorId:    u.me.id,
          executorId: target.id,
          args:       [defaultArg],
          socketId:   u.socketId,
        });
      }
    } catch (e: unknown) {
      // Softcode failure → fall through to plugin handler. We log so attribute
      // authors can discover broken softcode (silent swallowing was L2 in
      // TDD audit).
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[resolveFormat ${slot}] softcode eval failed on #${target.id}: ${msg}`);
    }
  }

  // 2. plugin handler
  return await runPluginFormatHandlers(slot, u, target, defaultArg);
}

/** Resolve a format slot or return the supplied fallback string. */
export async function resolveFormatOr(
  u: IUrsamuSDK,
  target: IDBObj,
  slot: FormatSlot,
  defaultArg: string,
  fallback: string,
): Promise<string> {
  return (await resolveFormat(u, target, slot, defaultArg)) ?? fallback;
}
