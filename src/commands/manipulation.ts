import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { target } from "../utils/target.ts";
import { displayName } from "../utils/displayName.ts";
import { moniker } from "../utils/moniker.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () => {
  addCmd({
    name: "get",
    pattern: /^get\s+(.*)/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const thing = await target(en, u.cmd.args[0]);
      if (!thing) return send([u.socketId || ""], "I don't see that here.");
      if (thing.location !== en.location) return send([u.socketId || ""], "I don't see that here.");
      if (thing.flags.includes("player")) return send([u.socketId || ""], "You can't pick up players!");
      if (thing.flags.includes("room") || thing.flags.includes("exit"))
        return send([u.socketId || ""], "You can't pick that up.");

      thing.location = en.id;
      await dbojs.modify({ id: thing.id }, "$set", thing);

      send([u.socketId || ""], `You pick up ${displayName(en, thing, true)}.`);
      send([`#${en.location}`], `${moniker(en)} picks up ${displayName(en, thing, true)}.`, {}, [u.socketId || ""]);
    },
  });

  addCmd({
    name: "drop",
    pattern: /^drop\s+(.*)/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const thing = await target(en, u.cmd.args[0]);
      if (!thing || thing.location !== en.id)
        return send([u.socketId || ""], "You aren't carrying that.");

      thing.location = en.location;
      await dbojs.modify({ id: thing.id }, "$set", thing);

      send([u.socketId || ""], `You drop ${displayName(en, thing, true)}.`);
      send([`#${en.location}`], `${moniker(en)} drops ${displayName(en, thing, true)}.`, {}, [u.socketId || ""]);
    },
  });

  addCmd({
    name: "give",
    pattern: /^give\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const [item, receiver] = u.cmd.args;
      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      if (/^\d+$/.test(item)) {
        const amount = parseInt(item, 10);
        const rec = await target(en, receiver);
        if (!rec || rec.location !== en.location)
          return send([u.socketId || ""], "They aren't here.");
        if (!rec.flags.includes("player"))
          return send([u.socketId || ""], "You can only give money to players.");
        const currentMoney = (en.data?.money as number) || 0;
        if (currentMoney < amount)
          return send([u.socketId || ""], "You don't have that much money.");
        en.data ||= {};
        rec.data ||= {};
        en.data.money = currentMoney - amount;
        rec.data.money = ((rec.data.money as number) || 0) + amount;
        await dbojs.modify({ id: en.id }, "$set", en);
        await dbojs.modify({ id: rec.id }, "$set", rec);
        send([u.socketId || ""], `You give ${amount} coins to ${moniker(rec)}.`);
        send([`#${rec.id}`], `${moniker(en)} gives you ${amount} coins.`);
        return;
      }

      const thing = await target(en, item);
      if (!thing || thing.location !== en.id)
        return send([u.socketId || ""], "You aren't carrying that.");
      const rec = await target(en, receiver);
      if (!rec || rec.location !== en.location)
        return send([u.socketId || ""], "They aren't here.");
      if (!rec.flags.includes("player"))
        return send([u.socketId || ""], "You can only give things to players.");

      thing.location = rec.id;
      await dbojs.modify({ id: thing.id }, "$set", thing);
      send([u.socketId || ""], `You give ${displayName(en, thing, true)} to ${moniker(rec)}.`);
      send([`#${rec.id}`], `${moniker(en)} gives you ${displayName(en, thing, true)}.`);
    },
  });
};
