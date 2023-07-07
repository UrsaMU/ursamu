import { IDBOBJ } from "../@types/IDBObj";
import { flags } from "../services/flags/flags";
import { canEdit } from "./canEdit";
import { moniker } from "./moniker";

export const displayName = (en: IDBOBJ, tar: IDBOBJ) => {
  if (canEdit(en, tar)) {
    return `${moniker(tar)}(#${tar.id}${flags.codes(tar.flags)})`;
  } else {
    return moniker(tar);
  }
};
