import { IDBOBJ } from "../@types/IDBObj";
import { Obj } from "../services";
import { dbojs } from "../services/Database";
import { IDBOBJ } from "../@types/IDBObj.ts";
import { dbojs } from "../services/Database/index.ts";

export const target = async (
  en: IDBOBJ,
  tar: string = "",
  global?: Boolean,
): Promise<Obj | null> => {
  // Handle special targets
  if (!tar || tar.toLowerCase() === "here") {
    const room = await Obj.get(en.location);
    return room || null;
export const target = async (
  en: IDBOBJ,
  tar: string,
  global?: boolean
): Promise<IDBOBJ | undefined | false> => {
  if (!tar || ["here", "room"].includes(tar.toLowerCase())) {
    return en.location ? await dbojs.queryOne({ id: en.location }) : undefined;
  }

  if (tar.startsWith("#")) {
    return await dbojs.queryOne({ id: tar.slice(1) });
  }

  if (tar.toLowerCase() === "me") {
    return new Obj().load(en);
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
    return undefined;
  }

  if (global) {
    return found;
  }

  if (found.location && en.location && 
      (found.location === en.location || found.id === en.location)) {
    return found;
  }
  
  return undefined;
};
