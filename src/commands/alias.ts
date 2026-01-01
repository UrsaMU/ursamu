import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { target } from "../utils/target.ts";
import { isNameTaken } from "../utils/isNameTaken.ts";

export default () => {
  addCmd({
    name: "@alias",
    pattern: /^[@/+]?alias\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    help: "Set an alias",
    exec: async (ctx, args) => {
      const [name, alias] = args;
      if (!ctx.socket.cid) return;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;
      const tar = await target(en, name, true);

      if (tar) {
        if (alias) {
          const taken = await isNameTaken(alias);
          if (taken && taken.id !== tar.id) {
            return send([ctx.socket.id], "That name or alias is already taken.", {});
          }
        }

        tar.data ||= {};
        tar.data.alias = alias;
        send(
          [ctx.socket.id],
          `Alias for ${tar.data.name} set to %ch${alias}%cn`,
          {}
        );
        dbojs.modify({ id: tar.id }, "$set", { data: tar.data });
      } else {
        send([ctx.socket.id], `I can't find that object.`, {});
      }
    },
  });
};
