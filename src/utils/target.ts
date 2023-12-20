import { IDBOBJ } from "../@types/IDBObj.ts";
import { dbojs } from "../services/Database/index.ts";

export const target = async (en: IDBOBJ, tar: string, global?: Boolean) => {
  if (!tar) {
    const ret = await dbojs.query({ id: en.location });
    return ret.length ? ret[0] : undefined;
  }

  if (+tar) {
    const ret = await dbojs.query({ id: +tar });
    return ret.length ? ret[0] : undefined;
  }

  if (tar.toLowerCase() === "here") {
    const ret = await dbojs.findOne({ id: en.location });
    return ret.length ? ret[0] : undefined;
  }

  if (tar.toLowerCase() === "me") {
    return en;
  }

  if (tar.toLowerCase() === "self") {
    return en;
  }

  if (tar.toLowerCase() === "room") {
    const ret = await dbojs.findOne({ id: en.location });
    return ret.length ? ret[0] : undefined;
  } else {
    const found = await (async () => {
      const ret = await dbojs.query({
        $where: function () {
          return (
            RegExp(this.data.name.replace(";", "|"), "ig").test(tar) ||
            this.id === +tar.slice(1) ||
            this.id === tar ||
            this.data.alias?.toLowerCase() === tar.toLowerCase()
          );
        },
      });
      return ret.length ? ret[0] : undefined;
    })();
    if (!found) {
      return;
    }

    if (global) {
      return found;
    } else {
      if (found.location === en.location || found.id === en.location) {
        return found;
      } else {
        return;
      }
    }
  }
};
