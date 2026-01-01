import { IDBOBJ } from "../@types/IDBObj.ts";
import { flags } from "../services/flags/flags.ts";

export const canEdit = (en: IDBOBJ, tar: IDBOBJ) => {
  return (
    (flags.check(en.flags, (tar.data?.lock as string | undefined) || "") &&
      (flags.lvl(en.flags) || 0) > (flags.lvl(tar.flags) || 0)) ||
    en.flags.includes("superuser") ||
    en.id === tar.id
  );
};
