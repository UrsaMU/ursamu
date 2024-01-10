import { IDBOBJ } from "../@types/IDBObj.ts";
import { dbojs } from "../services/Database/index.ts";

export const target = async (en: IDBOBJ, tar: string, global?: boolean) => {
  if (!tar || ["here", "room"].includes(tar.toLowerCase())) {
    return await dbojs.queryOne({ id: en.location });
  }

  if (+tar) {
    return await dbojs.queryOne({ id: +tar });
  }

  if (["me", "self"].includes(tar.toLowerCase())) {
    return en;
  }

  const found = await dbojs.queryOne({
    $or: [
      { "data.name": new RegExp(tar.toLowerCase().replace(";", "|"), "i") },
      { "data.alias": new RegExp(tar.toLowerCase().replace(";", "|"), "i") },
      { id: +tar },
      { id: +tar.slice(1) },
      { dbref: tar },
    ],
  });

  if (!found) {
    return;
  }

  if (found && (global || [found.location, found.id].includes(en.location))) {
    return found;
  }
};
