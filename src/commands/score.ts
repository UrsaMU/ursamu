import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { center } from "../utils/format.ts";

export default () =>
  addCmd({
    name: "score",
    pattern: /^score$/i,
    lock: "connected",
    exec: async (ctx) => {
      const en = await dbojs.queryOne({ id: ctx.socket.cid || "" });
      if (!en) return;

      // Basic Score Header
      let output = center(" %chScore%cn ", 78, "%cr=%cn") + "\n";
      
      // Basic Stats
      output += `Name: ${en.data?.name || "Unknown"}\n`;
      output += `DBRef: #${en.id}\n`;
      output += `Flags: ${en.flags}\n`;
      
      // Money (Placeholder if not implemented, using generic 'cents' or 'credits')
      // If we had an economy system, we'd check it here. 
      // output += `Money: ${en.data?.money || 0}\n`;

      // Location
      // output += `Location: #${en.location}\n`;

      output += center("", 78, "%cr=%cn");
      send([ctx.socket.id], output, {});
    },
  });
