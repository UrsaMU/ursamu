import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: give.ts
 * Allows a player to give an item or money to another player.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const [itemArg, receiverArg] = u.cmd.args;

  if (!itemArg || !receiverArg) {
    u.send("Give what to whom?");
    return;
  }

  const receiver = await u.util.target(actor, receiverArg);
  if (!receiver || receiver.location !== actor.location) {
    u.send("They aren't here.");
    return;
  }

  if (!receiver.flags.has("player")) {
    u.send("You can only give things to players.");
    return;
  }

  // Handle money giving
  if (/^\d+$/.test(itemArg)) {
    const amount = parseInt(itemArg, 10);
    const currentMoney = (actor.state.money as number) || 0;

    if (currentMoney < amount) {
      u.send("You don't have that much money.");
      return;
    }

    const receiverMoney = (receiver.state.money as number) || 0;

    await u.db.modify(actor.id, "$set", { "state.money": currentMoney - amount });
    await u.db.modify(receiver.id, "$set", { "state.money": receiverMoney + amount });

    const actorName = u.util.displayName(actor, actor);
    const receiverName = u.util.displayName(receiver, actor);

    u.send(`You give ${amount} coins to ${receiverName}.`);
    u.send(`${actorName} gives you ${amount} coins.`, receiver.id);
    return;
  }

  // Handle item giving
  const thing = await u.util.target(actor, itemArg);

  if (!thing || thing.location !== actor.id) {
    u.send("You aren't carrying that.");
    return;
  }

  await u.db.modify(thing.id, "$set", { location: receiver.id });

  const thingName = u.util.displayName(thing, actor);
  const actorName = u.util.displayName(actor, actor);
  const receiverName = u.util.displayName(receiver, actor);

  u.send(`You give ${thingName} to ${receiverName}.`);
  u.send(`${actorName} gives you ${thingName}.`, receiver.id);
};
