import { dbojs } from "../services/Database/index.ts";
import { escapeRegex } from "./escapeRegex.ts";

/** Returns the matching object if the name or alias is already taken, otherwise falsy. */
export const isNameTaken = async (name: string) => {
  const rx = new RegExp(`^${escapeRegex(name)}$`, "i");
  return await dbojs.findOne({
    $or: [{ "data.name": rx }, { "data.alias": rx }],
  });
};
