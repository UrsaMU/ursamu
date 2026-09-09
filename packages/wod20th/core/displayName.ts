// core/displayName.ts -- context-aware display name for shifted Garou.
// When a Garou is in a non-homid form AND has a deed name set, return the
// deed name; otherwise return the fallback (typically u.util.displayName).
// The login/db name is untouched -- this is purely presentation.
import type { IWoDChar } from "./types.ts";

const NON_HOMID = new Set(["glabro", "crinos", "hispo", "lupus"]);

/** Return the name onlookers see for `char` right now. */
export function shiftedDisplayName(char: IWoDChar | null | undefined, fallback: string): string {
  if (!char || !char.deedName || !char.deedName.trim()) return fallback;
  if (char.splat !== "wta") return fallback;
  if (!NON_HOMID.has(char.currentForm ?? "homid")) return fallback;
  return char.deedName;
}
