import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { canEdit } from "../utils/canEdit.ts";
import { target } from "../utils/target.ts";

export default () => {
  addCmd({
    name: "name",
    pattern: /^[@/+]?name\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;

      const potential = await dbojs.queryOne({
        name: new RegExp(args[2], "i"),
      });
      let tar = await target(en, args[0], true);
      if (!tar) return send([ctx.socket.id], "I can't find that.", {});
      if (!canEdit(en, tar)) {
        return send([ctx.socket.id], "I can't find that.", {});
      }
      if (
        potential &&
        args[2].toLowerCase() !== tar.data?.name?.toLowerCase() &&
        tar.flags.includes("player")
      ) {
        return send([ctx.socket.id], "That name is already taken.", {});
      }
      tar.data ||= {};
      tar.data.name = args[1];
      delete tar.data.moniker;
      await dbojs.modify({ id: tar.id }, "$set", tar);
      send([ctx.socket.id], "Name set.", {});
    },
  });
};
