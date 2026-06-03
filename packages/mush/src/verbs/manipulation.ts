import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK, IDBObj } from "../commands/types.ts";
import { evaluateLock } from "../world/locks.ts";
import { gameHooks } from "@ursamu/core";

async function fireFailAttrs(
  u: IUrsamuSDK,
  thing: IDBObj,
  actor: IDBObj,
  defaultMsg: string,
  defaultOmsg: string,
): Promise<void> {
  const actorName = u.util.displayName(actor, actor);
  const fail = await u.eval(thing.id, "FAIL");
  u.send(fail || defaultMsg);
  const ofail = await u.eval(thing.id, "OFAIL");
  u.here.broadcast(
    ofail ? `${actorName} ${ofail}` : defaultOmsg,
    { exclude: [actor.id] } as Record<string, unknown>,
  );
  const afail = await u.eval(thing.id, "AFAIL");
  if (afail && thing.state.owner) u.send(afail, thing.state.owner as string);
}

export async function execGet(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const arg = u.util.stripSubs(u.cmd.args[0] || "").trim();
  if (!arg) { u.send("Get what?"); return; }

  const thing = await u.util.target(actor, arg);
  if (!thing || thing.location !== actor.location) { u.send("I don't see that here."); return; }
  if (thing.flags.has("player")) { u.send("You can't pick up players!"); return; }
  if (thing.flags.has("room") || thing.flags.has("exit")) { u.send("You can't pick that up."); return; }

  const basicLock = (thing.state?.locks as Record<string, string>)?.basic;
  if (basicLock) {
    const allowed = await evaluateLock(basicLock, actor, thing);
    if (!allowed) {
      const thingName = u.util.displayName(thing, actor);
      const actorName = u.util.displayName(actor, actor);
      await fireFailAttrs(u, thing, actor,
        `You can't pick up ${thingName}.`,
        `${actorName} tries to pick up ${thingName}, but can't.`);
      return;
    }
  }

  const prevLocation = thing.location ?? null;
  await u.db.modify(thing.id, "$set", { location: actor.id });
  await (gameHooks as unknown as { emit(e: string, p: unknown): Promise<void> }).emit("object:moved", {
    objectId: thing.id,
    from: prevLocation,
    to: actor.id,
    cause: "get",
    actorId: actor.id,
  });

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
  const arg = u.util.stripSubs(u.cmd.args[0] || "").trim();
  if (!arg) { u.send("Drop what?"); return; }

  const thing = await u.util.target(actor, arg);
  if (!thing || thing.location !== actor.id) { u.send("You aren't carrying that."); return; }

  await u.db.modify(thing.id, "$set", { location: actor.location });
  await (gameHooks as unknown as { emit(e: string, p: unknown): Promise<void> }).emit("object:moved", {
    objectId: thing.id,
    from: actor.id,
    to: actor.location ?? null,
    cause: "drop",
    actorId: actor.id,
  });

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

  const thing = await u.util.target(actor, itemArg.trim());
  if (!thing || thing.location !== actor.id) { u.send("You aren't carrying that."); return; }

  await u.db.modify(thing.id, "$set", { location: receiver.id });
  await (gameHooks as unknown as { emit(e: string, p: unknown): Promise<void> }).emit("object:moved", {
    objectId: thing.id,
    from: actor.id,
    to: receiver.id,
    cause: "give",
    actorId: actor.id,
  });

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

export async function execUse(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const arg = u.util.stripSubs(u.cmd.args[0] || "").trim();
  if (!arg) { u.send("Use what?"); return; }

  const thing = await u.util.target(actor, arg);
  if (!thing) { u.send("I don't see that here."); return; }

  const thingName = u.util.displayName(thing, actor);
  const actorName = u.util.displayName(actor, actor);

  const useLock = (thing.state?.locks as Record<string, string>)?.use;
  if (useLock) {
    const allowed = await evaluateLock(useLock, actor, thing);
    if (!allowed) {
      await fireFailAttrs(u, thing, actor,
        `You can't use ${thingName}.`,
        `${actorName} tries to use ${thingName}, but can't.`);
      return;
    }
  }

  const use = await u.eval(thing.id, "USE");
  u.send(use || `You use ${thingName}.`);

  const ouse = await u.eval(thing.id, "OUSE");
  u.here.broadcast(
    ouse ? `${actorName} ${ouse}` : `${actorName} uses ${thingName}.`,
    { exclude: [actor.id] } as Record<string, unknown>,
  );

  const ause = await u.eval(thing.id, "AUSE");
  if (ause && thing.state.owner) u.send(ause, thing.state.owner as string);
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
  help: `drop <object>  — Drop an object from your inventory into the room.

Examples:
  drop sword
  drop #12`,
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

addCmd({
  name: "use",
  pattern: /^use\s+(.*)/i,
  lock: "connected",
  category: "Object",
  help: `use <object>  — Use an object, triggering its USE/OUSE/AUSE attributes.

The object's USE attribute is shown to you, OUSE to the room,
and AUSE to the object's owner. The USE lock controls access.

Examples:
  use lever
  use #12`,
  exec: execUse,
});
