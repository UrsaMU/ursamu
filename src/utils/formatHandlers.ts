/**
 * Local format helpers — bridge re-exports removed; callers use @ursamu/mush directly.
 */
import type { IUrsamuSDK, IDBObj, FormatSlot } from "@ursamu/mush";
import { resolveFormat as _resolveFormat } from "@ursamu/mush";

export async function runPluginFormatHandlers(
  slot: FormatSlot,
  u: IUrsamuSDK,
  target: IDBObj,
  defaultArg: string,
): Promise<string | null> {
  return await _resolveFormat(u, target, slot, defaultArg);
}
