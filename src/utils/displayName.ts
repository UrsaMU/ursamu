import { IDBOBJ } from "../@types/IDBObj.ts";
import { flags } from "../services/flags/flags.ts";
import { canEdit } from "./canEdit.ts";
import { moniker } from "./moniker.ts";

export const displayName = (en: IDBOBJ, tar: IDBOBJ) => {
  if (canEdit(en, tar)) {
    return `${moniker(tar)}(#${tar.id}${flags.codes(tar.flags)})`;
  } else {
    return moniker(tar);
  }
};
