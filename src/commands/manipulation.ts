import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { target } from "../utils/target.ts";
import { displayName } from "../utils/displayName.ts";
import { moniker } from "../utils/moniker.ts";

export default () => {
  addCmd({
    name: "get",
    pattern: /^get\s+(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const en = await dbojs.queryOne({ id: ctx.socket.cid || "" });
      if (!en) return;

      const thing = await target(en, args[0]);
      if (!thing) {
        return send([ctx.socket.id], "I don't see that here.", {});
      }

      if (thing.location !== en.location) {
        return send([ctx.socket.id], "I don't see that here.", {});
      }
      
      if (thing.flags.includes("player")) {
          return send([ctx.socket.id], "You can't pick up players!", {});
      }

      // Check for lock? For MVP, assume if you can see it and it's not fixed, you can take it.
      // Or check 'enter' lock? MUX uses 'get' or 'data.lock'? 
      // We haven't implemented specific 'get' locks yet. 
      // For now, let's allow getting anything that isn't an exit or room.

      if (thing.flags.includes("room") || thing.flags.includes("exit")) {
           return send([ctx.socket.id], "You can't pick that up.", {});
      }

      thing.location = en.id;
      await dbojs.modify({ id: thing.id }, "$set", thing);

      send([ctx.socket.id], `You pick up ${displayName(en, thing, true)}.`, {});
      send([`#${en.location}`], `${moniker(en)} picks up ${displayName(en, thing, true)}.`, { exclude: [ctx.socket.id] });
    },
  });

  addCmd({
    name: "drop",
    pattern: /^drop\s+(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const en = await dbojs.queryOne({ id: ctx.socket.cid || "" });
      if (!en) return;

      // Target must be in inventory
      // The target utility usually searches relative to enactor (inventory then room).
      // We need to ensure it's in inventory.
      const thing = await target(en, args[0]);
      
      if (!thing || thing.location !== en.id) {
          return send([ctx.socket.id], "You aren't carrying that.", {});
      }

      thing.location = en.location;
      await dbojs.modify({ id: thing.id }, "$set", thing);

      send([ctx.socket.id], `You drop ${displayName(en, thing, true)}.`, {});
      send([`#${en.location}`], `${moniker(en)} drops ${displayName(en, thing, true)}.`, { exclude: [ctx.socket.id] });
    },
  });

  addCmd({
      name: "give",
      pattern: /^give\s+(.*)\s*=\s*(.*)/i,
      lock: "connected",
      exec: async (ctx, args) => {
          const [item, receiver] = args;
          const en = await dbojs.queryOne({ id: ctx.socket.cid || "" });
          if (!en) return;

          const thing = await target(en, item);
          if (!thing || thing.location !== en.id) {
              return send([ctx.socket.id], "You aren't carrying that.", {});
          }

          const rec = await target(en, receiver);
          if (!rec || rec.location !== en.location) {
               return send([ctx.socket.id], "They aren't here.", {});
          }
          
          if (!rec.flags.includes("player")) {
               return send([ctx.socket.id], "You can only give things to players.", {});
          }

          thing.location = rec.id;
          await dbojs.modify({ id: thing.id }, "$set", thing);

          send([ctx.socket.id], `You give ${displayName(en, thing, true)} to ${moniker(rec)}.`, {});
          send([`#${rec.id}`], `${moniker(en)} gives you ${displayName(en, thing, true)}.`, {});
      }
  })
};
