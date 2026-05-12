import { addCmd } from "../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export async function execGet(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const arg = (u.cmd.args[0] || "").trim();
  if (!arg) { u.send("Get what?"); return; }

  const thing = await u.util.target(actor, arg);
  if (!thing || thing.location !== actor.location) { u.send("I don't see that here."); return; }
  if (thing.flags.has("player")) { u.send("You can't pick up players!"); return; }
  if (thing.flags.has("room") || thing.flags.has("exit")) { u.send("You can't pick that up."); return; }

  await u.db.modify(thing.id, "$set", { location: actor.id });

  const thingName = u.util.displayName(thing, actor);
  const actorName = u.util.displayName(actor, actor);

  const succ = await u.eval(thing.id, "SUCC");
  u.send(succ || `You pick up ${thingName}.`);

  const osucc = await u.eval(thing.id, "OSUCC");
  u.here.broadcast(
    osucc ? `${actorName} ${osucc}` : `${actorName} picks up ${thingName}.`,
    { exclude: [actor.id] } as Record<string, unknown>,
  );

  const asucc = await u.eval(thing.id, "ASUCC");
  if (asucc && thing.state.owner) u.send(asucc, thing.state.owner as string);
}

export async function execDrop(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const arg = (u.cmd.args[0] || "").trim();
  if (!arg) { u.send("Drop what?"); return; }

  const thing = await u.util.target(actor, arg);
  if (!thing || thing.location !== actor.id) { u.send("You aren't carrying that."); return; }

  await u.db.modify(thing.id, "$set", { location: actor.location });

  const thingName = u.util.displayName(thing, actor);
  const actorName = u.util.displayName(actor, actor);

  const drop = await u.eval(thing.id, "DROP");
  u.send(drop || `You drop ${thingName}.`);

  const odrop = await u.eval(thing.id, "ODROP");
  u.here.broadcast(
    odrop ? `${actorName} ${odrop}` : `${actorName} drops ${thingName}.`,
    { exclude: [actor.id] } as Record<string, unknown>,
  );

  const adrop = await u.eval(thing.id, "ADROP");
  if (adrop && thing.state.owner) u.send(adrop, thing.state.owner as string);
}

export async function execGive(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const [itemArg, receiverArg] = u.cmd.args;
  if (!itemArg || !receiverArg) { u.send("Give what to whom?"); return; }

  const receiver = await u.util.target(actor, receiverArg);
  if (!receiver || receiver.location !== actor.location) { u.send("They aren't here."); return; }
  if (!receiver.flags.has("player")) { u.send("You can only give things to players."); return; }

  // Money giving
  if (/^\d+$/.test(itemArg.trim())) {
    const amount = parseInt(itemArg.trim(), 10);
    if (amount <= 0 || amount > 999_999_999) {
      u.send("Invalid amount. Must be between 1 and 999,999,999.");
      return;
    }
    const currentMoney = (actor.state.money as number) || 0;
    if (currentMoney < amount) { u.send("You don't have that much money."); return; }
    const receiverMoney = (receiver.state.money as number) || 0;
    await u.db.modify(actor.id, "$set", { "data.money": currentMoney - amount });
    await u.db.modify(receiver.id, "$set", { "data.money": receiverMoney + amount });
    const actorName = u.util.displayName(actor, actor);
    const receiverName = u.util.displayName(receiver, actor);
    u.send(`You give ${amount} coins to ${receiverName}.`);
    u.send(`${actorName} gives you ${amount} coins.`, receiver.id);
    u.here.broadcast(
      `${actorName} gives ${amount} coins to ${receiverName}.`,
      { exclude: [actor.id, receiver.id] } as Record<string, unknown>,
    );
    return;
  }

  // Item giving
  const thing = await u.util.target(actor, itemArg.trim());
  if (!thing || thing.location !== actor.id) { u.send("You aren't carrying that."); return; }

  await u.db.modify(thing.id, "$set", { location: receiver.id });

  const thingName = u.util.displayName(thing, actor);
  const actorName = u.util.displayName(actor, actor);
  const receiverName = u.util.displayName(receiver, actor);

  const succ = await u.eval(thing.id, "SUCC");
  u.send(succ || `You give ${thingName} to ${receiverName}.`);
  u.send(`${actorName} gives you ${thingName}.`, receiver.id);

  const osucc = await u.eval(thing.id, "OSUCC");
  u.here.broadcast(
    osucc ? `${actorName} ${osucc}` : `${actorName} gives ${thingName} to ${receiverName}.`,
    { exclude: [actor.id, receiver.id] } as Record<string, unknown>,
  );

  const asucc = await u.eval(thing.id, "ASUCC");
  if (asucc && thing.state.owner) u.send(asucc, thing.state.owner as string);
}

export async function execCreateObject(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const input = (u.cmd.args[0] || "").trim();
  if (!input) { u.send("Usage: @create <name>[=<cost>]"); return; }

  const eqIdx = input.indexOf("=");
  const objName = (eqIdx === -1 ? input : input.slice(0, eqIdx)).trim();
  const objCost = eqIdx === -1 ? 0 : parseInt(input.slice(eqIdx + 1).trim(), 10) || 0;

  const isStaff = actor.flags.has("wizard") || actor.flags.has("admin") || actor.flags.has("superuser");
  const quota = (actor.state.quota as number) || 0;
  const cost = 1;

  if (!isStaff && quota < cost) {
    u.send(`You don't have enough quota. Cost: ${cost}, You have: ${quota}.`);
    return;
  }

  const thing = await u.db.create({
    flags: new Set(["thing"]),
    location: actor.id,
    state: { name: objName, owner: actor.id, value: objCost },
  });

  if (!isStaff) {
    await u.db.modify(actor.id, "$set", { "data.quota": quota - cost });
  }

  u.send(`You create ${objName} (#${thing.id}).`);
}

addCmd({
  name: "get",
  pattern: /^get\s+(.*)/i,
  lock: "connected",
  category: "Object",
  help: `get <object>  — Pick up an object from the room.

Examples:
  get sword
  get #5`,
  exec: execGet,
});

addCmd({
  name: "drop",
  pattern: /^drop\s+(.*)/i,
  lock: "connected",
  category: "Object",
  help: `drop <object>  — Drop an object from your inventory.

Examples:
  drop sword`,
  exec: execDrop,
});

addCmd({
  name: "give",
  pattern: /^give\s+(.+)\s*=\s*(.*)/i,
  lock: "connected",
  category: "Object",
  help: `give <item>=<player>    — Give an item to a player.
give <amount>=<player>  — Give coins to a player.

Examples:
  give sword=Alice
  give 50=Bob`,
  exec: execGive,
});
