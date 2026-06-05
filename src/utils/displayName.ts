import type { IDBOBJ } from "@ursamu/mush";
import { flags } from "@ursamu/mush";
import { moniker as _moniker } from "./moniker.ts";

/** Display name for an object: moniker + dbref/flags when `en` controls `tar`. */
export const displayName = (en: IDBOBJ, tar: IDBOBJ, controls = false): string => {
  if (
    controls ||
    en.flags.includes("superuser") ||
    en.flags.includes("admin") ||
    en.id === tar.id ||
    String(tar.data?.owner || "").replace(/^#/, "") === String(en.id).replace(/^#/, "")
  ) {
    return `${_moniker(tar)}(#${tar.id}${flags.codes(tar.flags).toUpperCase()})`;
  }
  return _moniker(tar);
};
