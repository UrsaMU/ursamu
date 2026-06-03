/**
 * Bridge: re-exports resolve-format utilities from @ursamu/mush.
 */
export {
  resolveFormat,
  resolveGlobalFormat,
} from "@ursamu/mush";
export type { FormatSlot } from "@ursamu/mush";

import type { IDBObj, IUrsamuSDK } from "../@types/UrsamuSDK.ts";
import { resolveFormat as _resolveFormat } from "@ursamu/mush";
import type { FormatSlot } from "@ursamu/mush";

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
