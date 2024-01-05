import { IAttribute } from "../index.ts";
import { addCmd, Obj, send } from "../services/index.ts";
import { canEdit, target } from "../utils/index.ts";
import { moniker } from "../utils/moniker.ts";
import { setAttr } from "../utils/setAttr.ts";

export default () => {
  addCmd({
    name: "&",
    pattern: /^&(.*)\s+(.*)\s*=\s*(.*)?$/i,
    lock: "connected",
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
        return send([ctx.socket.id], "%chGame>%cn You can't edit that.");
      }
      tarObj.dbobj.data ||= { attributes: [] };

      setAttr(tarObj, args[0], args[2], en);
      if (tarObj.dbref === en.dbref) {
        return send(
          [ctx.socket.id],
          `%chGame>%cn You ${args[2] ? "set" : "remove"} your attribute: %ch${
            args[0].toUpperCase()
          }%cn.`,
        );
      }

      return send(
        [ctx.socket.id],
        `%chGame>%cn ${args[2] ? "set" : "remove"} set ${
          moniker(tarObj)
        }'s attribute: %ch${args[0].toUpperCase()}%cn.`,
      );
    },
  });
};
