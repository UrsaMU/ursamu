import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: clone.ts
 * Migrated from legacy @clone command.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const fullArgs = u.cmd.args.join(" ").trim();
  
  // Pattern: @clone <obj>=<new name>
  const [objName, newName] = fullArgs.split("=");
  
  const searchTarget = await u.db.search(objName.trim());
  const obj = searchTarget[0];

  if (!obj) {
    u.send("I can't see that here.");
    return;
  }

  // Permission check
  if (!u.canEdit(actor, obj)) {
    u.send("Permission denied.");
    return;
  }

  // Prepare clone template
  const cloneTemplate = {
    flags: obj.flags,
    location: actor.id, // Clone appears in inventory
    state: {
      ...obj.state,
      name: newName ? newName.trim() : (obj.state.name || "Cloned Object"),
      password: "", // Don't copy password
      owner: actor.id
    }
  };

  // Note: Attributes in the new system are part of the state. 
  // If the target has attributes in its state, they will be copied by the spread operator.
  // We might want to update the 'setter' of attributes if they are tracked.

  const clone = await u.db.create(cloneTemplate);
  
  u.send(`Cloned: ${u.util.displayName(obj, actor)}(#${obj.id}) -> ${clone.state.name}(#${clone.id})`);
};
