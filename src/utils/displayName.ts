import type { IDBOBJ } from "../@types/IDBObj.ts";
import { flags } from "../services/flags/flags.ts";
import { moniker } from "./moniker.ts";

export const displayName = (en: IDBOBJ, tar: IDBOBJ, controls = false) => {
  if (controls || en.flags.includes("superuser") || en.id === tar.id) {
    return `${moniker(tar)}(#${tar.id}${flags.codes(tar.flags)})`;
  } else {
    return moniker(tar);
  }
};
