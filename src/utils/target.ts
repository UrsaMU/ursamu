import { IDBOBJ } from "../@types/IDBObj.ts";
import { dbojs } from "../services/Database/index.ts";

export const target = async (en: IDBOBJ, tar: string, global?: boolean) => {
  if (!tar || ["here", "room"].includes(tar.toLowerCase())) {
    const ret = await dbojs.query({ id: en.location });
    return ret.length ? ret[0] : undefined;
  }

  if (+tar) {
    const ret = await dbojs.query({ id: +tar });
    return ret.length ? ret[0] : undefined;
  }

  if (["me", "self"].includes(tar.toLowerCase())) {
    return en;
  }

  const found = await (async () => {
    const ret = await dbojs.query({
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
    return ret.length ? ret[0] : undefined;
  })();

  if (!found) {
    return;
  }

  if (found && (global || [found.location, found.id].includes(en.location))) {
    return found;
  }

};
