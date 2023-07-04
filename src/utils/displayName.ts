import { IDBOBJ } from "../@types/IDBObj";
import { canEdit } from "./canEdit";

export const name = (en: IDBOBJ) => en.data?.moniker || en.data?.name;

export const displayName = (en: IDBOBJ, tar: IDBOBJ) => {
  if (canEdit(en, tar)) {
    return `${tar.data?.name}(#${tar.id})`;
  } else {
    return tar.data?.name;
  }
};
