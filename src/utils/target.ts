import { IDBOBJ } from "../@types/IDBObj.ts";
import { dbojs } from "../services/Database/index.ts";

export const target = async (
  en: IDBOBJ,
  tar: string = "",
  global?: boolean
): Promise<IDBOBJ | false> => {
  // Handle special targets
  if (!tar || ["here", "room"].includes(tar.toLowerCase())) {
    if (en.location) {
      return await dbojs.queryOne({ id: en.location });
    }
    return false;
  }

  if (tar.startsWith("#")) {
    return await dbojs.queryOne({ id: tar.slice(1) });
  }

  if (["me", "self"].includes(tar.toLowerCase())) {
    return en;
  }

  const found = await (async () => {
    return await dbojs.queryOne({
      $where: function () {
        const target = `${tar}`;
        return (
          RegExp(this.data?.name?.replace(";", "|") || "", "ig").test(target) ||
          this.id === target ||
          this.data?.alias?.toLowerCase() === target.toLowerCase()
        );
      },
    });
  })();

  if (!found) {
    return false;
  }

  if (global) {
    return found;
  }

  if (found.location && en.location && 
      (found.location === en.location || found.id === en.location)) {
    return found;
  }
  
  return false;
};
