import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { target } from "../utils/target.ts";

export default () => {
  addCmd({
    name: "@alias",
    pattern: /^[@/+]?alias\s+(.*)\s*=\s*(.+)/i,
    lock: "connected",
    help: "Set an alias",
    exec: async (ctx, args) => {
      const [name, alias] = args;
      const en = await dbojs.findOne({ id: ctx.socket.cid });
      if (!en) return;
      const tar = await target(en, name, true);

      if (tar) {
        tar.data ||= {};
        tar.data.alias = alias;
        send(
          [ctx.socket.id],
          `Alias for ${tar.data.name} set to %ch${alias}%cn`,
          {}
        );
        dbojs.update({ id: tar.id }, { $set: { data: tar.data } });
      } else {
        send([ctx.socket.id], `I can't find that object.`, {});
      }
    },
  });
};
