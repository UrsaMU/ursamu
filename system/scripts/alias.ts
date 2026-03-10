import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["alias"];

export default async (u: IUrsamuSDK) => {
  const args = u.cmd.args;
  const input = args.join(" "); // "target=alias" or "target="

  const [name, alias] = input.split("=");
  
  // 1. Target check
  const target = await u.util.target(u.me, name.trim(), true); // true = priority? checking source logic: target(en, name, true)
  
  if (!target) {
    return u.send("I can't find that object.");
  }
  
  // 2. Permission check
  if (!u.canEdit(u.me, target)) {
      return u.send("Permission denied.");
  }

  // 3. Set Alias
  const aliasName = alias ? alias.trim() : "";
  
  if (aliasName) {
    // Check if taken?
    // SDK doesn't expose 'isNameTaken'. 
    // We might need to assume it's okay or add API.
    // Original code checked `isNameTaken`.
    // We can use `u.db.search` to check.
    const taken = await u.db.search({ "data.alias": new RegExp(`^${aliasName}$`, "i") });
    const takenName = await u.db.search({ "data.name": new RegExp(`^${aliasName}$`, "i") });
    
    if (taken.length > 0 && taken[0].id !== target.id) {
        return u.send("That alias is already taken.");
    }
    if (takenName.length > 0 && takenName[0].id !== target.id) {
        return u.send("That name is already taken.");
    }
    
    // Set 
    target.state.alias = aliasName;
    await u.db.modify(target.id, "$set", { data: { alias: aliasName } });
    u.send(`Alias for ${target.name} set to ${aliasName}.`);
  } else {
    // Clear alias
    delete target.state.alias;
    await u.db.modify(target.id, "$unset", { "data.alias": 1 });
    u.send(`Alias for ${target.name} removed.`);
  }
};
