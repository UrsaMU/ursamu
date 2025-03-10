import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { displayName } from "../utils/displayName.ts";
import { target } from "../utils/target.ts";

export default () =>
  addCmd({
    name: "@describe",
    pattern: /^[@\+]?desc(?:ribe)?(?:\s+(.*)\s*=\s*(.*))?/i,
    lock: "connected",
    help: "Set a description",
    exec: async (ctx, args) => {
      if (!ctx.socket.cid) return;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;
      const tar = await target(en, args[0]);

      if (!tar) {
        send([ctx.socket.id], "I can't find that here!", {});
        return;
      }
      if (args[1]) {
        tar.description = args[1];
        await dbojs.modify({ id: tar.id }, "$set", tar);
        send(
          [ctx.socket.id],
          `Description for %ch${displayName(en, tar)}%cn set!`,
          {},
        );
        return;
      }
    },
  });
