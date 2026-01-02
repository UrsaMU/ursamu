import type { IDBOBJ } from "../@types/IDBObj.ts";
import { flags } from "../services/flags/flags.ts";

export const isAdmin = (en: IDBOBJ) => {
  return (flags.lvl(en.flags) || 0) >= 8;
};
