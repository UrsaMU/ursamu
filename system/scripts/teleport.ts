import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: teleport.ts
 * Migrated from legacy @teleport command.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const input = u.cmd.args.join(" ").trim();
  const match = input.match(/^(.+?)\s*=\s*(.*)$/);

  if (!match) {
    u.send("Usage: @teleport <target>=<destination>");
    return;
  }

  const targetName = match[1].trim();
  const destName = match[2].trim();

  const searchTarget = await u.db.search(targetName);
  const target = searchTarget[0];

  if (!target) {
    u.send(`Could not find target: ${targetName}`);
    return;
  }

  const searchDest = await u.db.search(destName);
  const destination = searchDest[0];

  if (!destination) {
    u.send(`Could not find destination: ${destName}`);
    return;
  }

  // Permission check: Usually you need to control the target or be staff
  if (!u.canEdit(actor, target)) {
     u.send("Permission denied.");
     return;
  }

  // Destination check: enter_ok or controlled
  const canEnter = u.canEdit(actor, destination) || destination.flags.has("enter_ok");
  if (!canEnter) {
    u.send("Permission denied (destination check).");
    return;
  }

  u.teleport(target.id, destination.id);
  
  const targetNameDisplay = u.util.displayName(target, actor);
  const destNameDisplay = u.util.displayName(destination, actor);

  u.send(`You teleport ${targetNameDisplay} to ${destNameDisplay}.`);
  // Note: The teleport method in SandboxService handles the actual movements and look.
};
