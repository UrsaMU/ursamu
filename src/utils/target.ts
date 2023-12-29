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

  const found = await (async () => {
    return await dbojs.queryOne({
      $where: function () {
        const target = `${tar}`;
        return (
          RegExp(this.data.name.replace(";", "|"), "ig").test(target) ||
          this.id === +target.slice(1) ||
          this.id === target ||
          this.data.alias?.toLowerCase() === target.toLowerCase()
        );
      },
    });
  })();

  if (!found) {
    return;
  }

  if (found && (global || [found.location, found.id].includes(en.location))) {
    return found;
  }
};
