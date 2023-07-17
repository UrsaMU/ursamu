import { IDBOBJ } from "../@types/IDBObj";
import { dbojs } from "../services/Database";

export const target = async (en: IDBOBJ, tar: string, global?: Boolean) => {
  if (!tar) {
    return await dbojs.findOne({ id: en.location });
  }

  if (+tar) {
    return await dbojs.findOne({ id: +tar });
  }

  if (tar.toLowerCase() === "here") {
    return await dbojs.findOne({ id: en.location });
  }

  if (tar.toLowerCase() === "me") {
    return en;
  }

  if (tar.toLowerCase() === "self") {
    return en;
  }

  if (tar.toLowerCase() === "room") {
    return await dbojs.findOne({ id: en.location });
  } else {
    const found = (
      await dbojs.find({
        $where: function () {
          return (
            RegExp(this.data.name.replace(";", "|"), "ig").test(tar) ||
            this.id === +tar.slice(1) ||
            this.id === tar ||
            this.data.alias?.toLowerCase() === tar.toLowerCase()
          );
        },
      })
    )[0];
    console.log(found);
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
