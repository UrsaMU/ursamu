import { existsSync } from "fs";
import { addCmd, Obj } from "../services";
import { join } from "path";
import { cwd } from "process";

export default () => {
  // @cgdata/insert <type>/<name>=<value>[!<value>..|<value N>]

  addCmd({
    name: "@cgdata",
    pattern: /^[@/+]?cgdata\s+(.*)\/(.*)\s*=\s*(.+)/i,
    lock: "connected admin+",
    help: "Set a data value",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const [type, name, value] = args;

      // check to see if the file exists.
      const path = join(cwd(), `/src/services/characters/stats/${type}s.ts`);
      if (existsSync(path)) {
        const stats = require(path);
        if (stats[name]) {
          const stat = stats[name];
          stat.type = type;
          stat.values = value.split("|").map((v) => v.trim());
        }
      }
    },
  });
};
