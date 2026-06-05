/**
 * Local format helpers — bridge re-exports removed; callers use @ursamu/mush directly.
 */
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
