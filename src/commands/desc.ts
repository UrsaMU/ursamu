import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { dbojs } from "../services/Database";
import { displayName } from "../utils/displayName.ts";
import { target } from "../utils/target.ts";

export default () =>
  addCmd({
    name: "@describe",
    pattern: /^[@\+]?desc(?:ribe)?(?:\s+(.*)\s*=\s*(.*))?/i,
    lock: "connected",
    help: "Set a description",
    exec: async (ctx, args) => {
      const en = await dbojs.findOne({ id: ctx.socket.cid });
      if (!en) return;
      const tar = await target(en, args[0]);

      if (!tar) {
        send([ctx.socket.id], "I can't find that here!", {});
        return;
      }

      if (args[1]) {
        tar.description = args[1];
        await dbojs.update({ id: tar.id }, tar);
        send(
          [ctx.socket.id],
          `Description for %ch${displayName(en, tar)}%cn set!`,
          {}
        );
        return;
      }
    },
  });
