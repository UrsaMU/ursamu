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
  const actorName = u.util.displayName(actor, actor);

  const drop = await u.eval(thing.id, "DROP");
  u.send(drop || `You drop ${displayName}.`);

  const odrop = await u.eval(thing.id, "ODROP");
  u.here.broadcast(
    odrop ? `${actorName} ${odrop}` : `${actorName} drops ${displayName}.`,
    { exclude: [actor.id] },
  );

  const adrop = await u.eval(thing.id, "ADROP");
  if (adrop && thing.state.owner) {
    u.send(adrop, thing.state.owner as string);
  }
};
