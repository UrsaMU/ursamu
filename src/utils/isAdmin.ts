import { IDBOBJ } from "../@types/IDBObj";
import { flags } from "../services/flags/flags";

export const isAdmin = (en: IDBOBJ) => {
  return (flags.lvl(en.flags) || 0) >= 8;
};
