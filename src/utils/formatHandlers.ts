/**
 * Bridge: re-exports format-handler pipeline from @ursamu/mush.
 */
export {
  registerFormatHandler,
  unregisterFormatHandler,
  registerFormatTemplate,
  resolveFormat,
  resolveGlobalFormat,
  _clearFormatHandlers,
} from "@ursamu/mush";
export type { FormatHandler } from "@ursamu/mush";
export type { FormatSlot } from "@ursamu/mush";

// Compat: runPluginFormatHandlers was a local helper; replicate via resolveFormat
// Callers that need it should use resolveFormat directly. Export a no-op shim for
// any remaining consumers.
import type { IUrsamuSDK, IDBObj } from "../@types/UrsamuSDK.ts";
import { resolveFormat as _resolveFormat } from "@ursamu/mush";
import type { FormatSlot } from "@ursamu/mush";

export async function runPluginFormatHandlers(
  slot: FormatSlot,
  u: IUrsamuSDK,
  target: IDBObj,
  defaultArg: string,
): Promise<string | null> {
  return await _resolveFormat(u, target, slot, defaultArg);
}
