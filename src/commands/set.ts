import { Obj } from "../services/DBObjs";
import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { canEdit } from "../utils/canEdit.ts";
import { target } from "../utils/target.ts";
import { set } from "lodash";

export default () => {
  addCmd({
    name: "@set",
    pattern: /^[@\+]?set\s+(.*)\/(.*)\s*=\s*(.*)?$/i,
    lock: "connected admin+",
    exec: async (ctx, args) => {
      const [t, k, v] = args;
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const tar = await target(en, t, true);
      if (!tar) return send([ctx.socket.id], "I don't see that here.");
      const tarObj = await Obj.get(tar.id);
      if (!tarObj?.dbobj)
        return send([ctx.socket.id], "I don't see that here.");

      if (canEdit(en, tarObj.dbobj)) {
        tarObj.dbobj.data ||= {};

        if (v === undefined) {
          delete tarObj.dbobj.data[k];
          await tarObj.save();
          return send(
            [ctx.socket.id],
            `%chGame>%cn Deleted %ch${k}%cn on ${tarObj.name}.`
          );
        }

        tarObj.dbobj.data = set(tarObj.dbobj.data, k, v);
        await tarObj.save();
        send(
          [ctx.socket.id],
          `%chGame>%cn Set %ch${k}%cn to %ch${v}%cn on ${tarObj.name}.`
        );
      }
    },
  });
};
