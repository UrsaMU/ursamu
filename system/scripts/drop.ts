import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: drop.ts
 * Allows a player to drop an object from their inventory.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const arg = u.cmd.args[0];

  if (!arg) {
    u.send("Drop what?");
    return;
  }

  const thing = await u.util.target(actor, arg);

  if (!thing || thing.location !== actor.id) {
    u.send("You aren't carrying that.");
    return;
  }

  await u.db.modify(thing.id, "$set", { location: actor.location });

  const displayName = u.util.displayName(thing, actor);
  u.send(`You drop ${displayName}.`);
  u.here.broadcast(`${u.util.displayName(actor, actor)} drops ${displayName}.`, { exclude: [actor.id] });
};
