import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["name"];

export default async (u: IUrsamuSDK) => {
  const input = u.cmd.args.join(" ");
  const [targetName, newName] = input.split("=");

  if (!targetName || !newName) {
      return u.send("Usage: @name <target>=<newname>");
  }

  const target = await u.util.target(u.me, targetName.trim(), true);
  if (!target) return u.send("I can't find that.");

  if (!(await u.canEdit(u.me, target))) return u.send("Permission denied.");

  // Using u.db.search instead
  // SDK doesn't expose isNameTaken directly in `u` but maybe `u.common`?
  // I need to check if `isNameTaken` is available.
  // `create.ts` used `u.db.search`.
  // `alias.ts` used `u.db.search`.
  // I should use `u.db.search`.
  
  const existing = await u.db.search({ "data.name": new RegExp(`^${newName.trim()}$`, "i") });
  if (existing.length > 0) {
       // Check if it's the same object?
       if (existing[0].id !== target.id) {
           return u.send("That name is already taken.");
       }
  }
  
  if (target.flags.has("player")) {
      // Check alias too?
      const aliasTaken = await u.db.search({ "data.alias": new RegExp(`^${newName.trim()}$`, "i") });
      if (aliasTaken.length > 0 && aliasTaken[0].id !== target.id) {
          return u.send("That name is taken as an alias.");
      }
  }

  target.state.name = newName.trim();
  delete target.state.moniker; // Clear moniker on rename

  // Build updated data, spreading current state and overriding name/clearing moniker
  // Note: DB.modify uses Object.assign, so we must pass the nested data object directly
  const newData = { ...target.state };
  delete newData.moniker;
  newData.name = newName.trim();
  await u.db.modify(target.id, "$set", { data: newData });
  
  u.send("Name set.");
};
