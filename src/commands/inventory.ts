import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { displayName } from "../utils/displayName.ts";
import { center } from "../utils/format.ts";

export default () =>
  addCmd({
    name: "inventory",
    pattern: /^i(?:nv(?:entory)?)?$/i,
    lock: "connected",
    exec: async (ctx) => {
      const en = await dbojs.queryOne({ id: ctx.socket.cid || "" });
      if (!en) return;

      const contents = await dbojs.query({ location: en.id });
      const items = contents.filter(
        (c) => !c.flags.includes("exit") && !c.flags.includes("room")
      );

      let output = center(" %chInventory%cn ", 78, "%cr=%cn") + "\n";
      
      if (items.length === 0) {
        output += "You aren't carrying anything.\n";
      } else {
        for (const item of items) {
            output += displayName(en, item, true) + "\n";
        }
      }

      output += center("", 78, "%cr=%cn");
      send([ctx.socket.id], output, {});
    },
  });
