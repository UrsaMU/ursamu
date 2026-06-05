import type { IDBOBJ } from "@ursamu/mush";
import { dbojs } from "@ursamu/mush";

export const setFlags = async (obj: IDBOBJ, flagStr: string, _actor?: IDBOBJ): Promise<void> => {
  const tokens = flagStr.trim().split(/\s+/);
  let fl = obj.flags || "";
  for (const token of tokens) {
    if (token.startsWith("!")) {
      const f = token.slice(1);
      fl = fl.replace(new RegExp(`\\b${f}\\b`, "gi"), "").replace(/\s+/g, " ").trim();
    } else if (!new RegExp(`\\b${token}\\b`, "i").test(fl)) {
      fl = `${fl} ${token}`.trim();
    }
  }
  obj.flags = fl;
  await dbojs.modify({ id: obj.id }, "$set", obj);
};
