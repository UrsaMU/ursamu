import { dbojs } from "../services/Database/index.ts";

/**
 * Check if a name or alias is already taken.
 * @param name The name to check.
 * @returns The object that has the name or alias, or false if not found.
 */
export const isNameTaken = async (name: string) => {
  return await dbojs.findOne({
    $or: [
      { "data.name": new RegExp(`^${name}$`, "i") },
      { "data.alias": new RegExp(`^${name}$`, "i") },
    ],
  });
};
