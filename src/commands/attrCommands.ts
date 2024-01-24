import { IAttribute, setAttribute } from "../index.ts";
import { addCmd, flags, Obj, send } from "../services/index.ts";
import { canEdit, target } from "../utils/index.ts";

export default () => {
  addCmd({
    name: "&",
    pattern: /^&(.*)\s+(.*)\s*=\s*(.*)?$/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      console.log(args);
      const tar = await target(en, args[1]);
      if (!tar) return send([ctx.socket.id], "%chGame>%cn Target not found.");

      const tarObj = await Obj.get(tar.id);
      if (!tarObj) {
        return send([ctx.socket.id], "%chGame>%cn Target not found.");
      }

      if (!canEdit(en, tar)) {
        return send([ctx.socket.id], "%chGame>%cn Permission denied.");
      }

      if (args[1].startsWith("_") && !flags.check(en.flags, "admin+")) {
        return send([ctx.socket.id], "%chGame>%cn Permission denied.");
      }

      setAttribute(en, tarObj, args[0], args[2] || "");

      return await send(
        [ctx.socket.id],
        `%chGame>%cn  ${tarObj.name}'s attribute %ch${
          args[0].toUpperCase()
        }%cn ${args[2] ? "set" : "removed"}.`,
      );
    },
  });
};
