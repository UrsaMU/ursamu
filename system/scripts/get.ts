import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: get.ts
 * Allows a player to pick up an object from their current location.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const arg = u.cmd.args[0];

  if (!arg) {
    u.send("Get what?");
    return;
  }

  const thing = await u.util.target(actor, arg);

  if (!thing) {
    u.send("I don't see that here.");
    return;
  }

  if (thing.location !== actor.location) {
    u.send("I don't see that here.");
    return;
  }

  if (thing.flags.has("player")) {
    u.send("You can't pick up players!");
    return;
  }

  if (thing.flags.has("room") || thing.flags.has("exit")) {
    u.send("You can't pick that up.");
    return;
  }

  // Check for locks would go here (e.g., u.checkLock(thing, "get"))
  // For now, following legacy behavior.

  await u.db.modify(thing.id, "$set", { location: actor.id });

  const displayName = u.util.displayName(thing, actor);
  u.send(`You pick up ${displayName}.`);
  u.here.broadcast(`${u.util.displayName(actor, actor)} picks up ${displayName}.`, { exclude: [actor.id] });
};
