import { IDBOBJ } from "../@types/IDBObj.ts";
import { dbojs } from "../services/Database/index.ts";
import { Obj } from "../services/index.ts";

export const target = async (en: IDBOBJ, tar: string, global?: boolean) => {
  if (!tar || ["here", "room"].includes(tar.toLowerCase())) {
    return new Obj(await dbojs.queryOne({ id: en.location }));
  }

  if (+tar) {
    return new Obj(await dbojs.queryOne({ id: +tar }));
  }

  if (["me", "self"].includes(tar.toLowerCase())) {
    return new Obj(en);
  }

  const lowerCaseTar = tar.toLowerCase();
  const found = await dbojs.queryOne({
    $or: [
      { "data.name": new RegExp(lowerCaseTar.replace(";", "|"), "i") },
      { "data.alias": new RegExp(lowerCaseTar.replace(";", "|"), "i") },
      { id: +tar },
      { id: +tar.slice(1) },
      { dbref: tar },
    ],
  });

  if (!found) {
    return;
  }

  if (found && (global || [found.location, found.id].includes(en.location))) {
    return new Obj(found);
  }
};
