import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: link.ts
 * Migrated from legacy @link command.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const input = u.cmd.args.join(" ").trim();
  const match = input.match(/^(.+?)\s*=\s*(.*)$/);

  if (!match) {
    u.send("Usage: @link <target>=<destination>");
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

  if (!u.canEdit(actor, target)) {
    u.send("Permission denied.");
    return;
  }

  const searchDest = await u.db.search(destName);
  const destination = searchDest[0];

  if (!destination) {
    u.send(`Could not find destination: ${destName}`);
    return;
  }

  // Handle linking based on object type
  if (target.flags.has("room")) {
    // Rooms link their 'dropto'
    await u.db.modify(target.id, "$set", { "data.dropto": destination.id });
    u.send(`You link ${u.util.displayName(target, actor)} to ${u.util.displayName(destination, actor)}.`);
  } else if (target.flags.has("exit")) {
    // Exits link their 'destination'
    await u.db.modify(target.id, "$set", { "data.destination": destination.id });
    u.send(`You link ${u.util.displayName(target, actor)} to ${u.util.displayName(destination, actor)}.`);
  } else {
    // Players/Things link their 'home'
    // Permission check for home linking (usually needs to be link_ok or controlled)
    const canLinkTo = u.canEdit(actor, destination) || destination.flags.has("link_ok");
    if (!canLinkTo) {
      u.send("You can't link to that.");
      return;
    }
    await u.db.modify(target.id, "$set", { "data.home": destination.id });
    u.send(`You link ${u.util.displayName(target, actor)} to ${u.util.displayName(destination, actor)}.`);
  }
};
