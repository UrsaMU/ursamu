import type { IDBOBJ } from "../@types/IDBObj.ts";
import { flags } from "../services/flags/flags.ts";
import { moniker } from "./moniker.ts";

export const displayName = (en: IDBOBJ, tar: IDBOBJ, controls = false) => {
  if (
    controls ||
    en.flags.includes("superuser") ||
    en.flags.includes("admin") ||
    en.id === tar.id ||
    (tar.data?.owner === en.id || tar.data?.owner === `#${en.id}`)
  ) {
    return `${moniker(tar)}(#${tar.id}${flags.codes(tar.flags).toUpperCase()})`;
  } else {
    return moniker(tar);
  }
};
