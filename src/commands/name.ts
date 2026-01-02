import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { canEdit } from "../utils/canEdit.ts";
import { target } from "../utils/target.ts";
import { isNameTaken } from "../utils/isNameTaken.ts";

export default () => {
  addCmd({
    name: "name",
    pattern: /^[@/+]?name\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const en = await dbojs.queryOne({ id: ctx.socket.cid || "" });
      if (!en) return;

      const [name, newName] = args;
      const potential = await isNameTaken(newName);
      const tar = await target(en, name, true);
      if (!tar) return send([ctx.socket.id], "I can't find that.", {});
      if (!await canEdit(en, tar))
        return send([ctx.socket.id], "I can't find that.", {});
      if (
        potential &&
        newName.toLowerCase() !== tar.data?.name?.toLowerCase() &&
        tar.flags.includes("player")
      )
        return send([ctx.socket.id], "That name or alias is already taken.", {});
      tar.data ||= {};
      tar.data.name = newName;
      delete tar.data.moniker;
      await dbojs.modify({ id: tar.id }, "$set", tar);
      send([ctx.socket.id], "Name set.", {});
    },
  });
};
