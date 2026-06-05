/**
 * Local resolve-format helpers — bridge re-exports removed; callers use @ursamu/mush directly.
 */
import type { IDBObj, IUrsamuSDK, FormatSlot } from "@ursamu/mush";
import { resolveFormat as _resolveFormat } from "@ursamu/mush";

/** Resolve a format slot or return the supplied fallback string. */
export async function resolveFormatOr(
  u: IUrsamuSDK,
  target: IDBObj,
  slot: FormatSlot,
  defaultArg: string,
  fallback: string,
): Promise<string> {
  return (await _resolveFormat(u, target, slot, defaultArg)) ?? fallback;
}
