import { IDBOBJ } from "../@types/IDBObj";
import { flags } from "../services/flags/flags";

export const canEdit = (en: IDBOBJ, tar: IDBOBJ) => {
  return (
    (flags.lvl(en.flags) || 0) > (flags.lvl(tar.flags) || 0) ||
    en.flags.includes("superuser")
  );
};
