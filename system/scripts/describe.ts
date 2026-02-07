import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["desc"];

/**
 * System Script: describe.ts
 * ESM Refactored, Production-ready, and Telnet-compatible.
 */
export default async (u: IUrsamuSDK) => {
  const input = u.cmd.args[0] || "";
  const match = input.match(/^(?:(.+?)\s*=\s*(.*)|(.+))$/);

  let targetName = "";
  let description = "";

  if (!match) {
    u.send("Usage: @describe <target>=<description>");
    return;
  }

  // Case 1: <target>=<description>
  if (match[1] && match[2] !== undefined) {
    targetName = match[1].trim();
    description = match[2].trim();
  } 
  else if (match[3]) {
     u.send("Usage: @describe <target>=<description>");
     return;
  }

  const targets = await u.db.search(targetName);
  const target = targets[0];
  
  if (!target) {
    u.send(`I can't find "${targetName}" here.`);
    return;
  }

  if (!u.canEdit(u.me, target)) {
    u.send("Permission denied.");
    return;
  }

  if (description.length > 4096) {
    u.send("Description too long.");
    return;
  }

  await u.db.modify(target.id, "$set", { 
      data: { 
          ...target.state, // This includes 'description' now
          description: description 
      } 
  });
  
  u.send("Set.");
};
