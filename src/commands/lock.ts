import { Obj } from "../services/DBObjs/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { canEdit } from "../utils/canEdit.ts";
import { displayName } from "../utils/displayName.ts";
import { target } from "../utils/target.ts";

export default () => {
  addCmd({
    name: "@lock",
    pattern: /^[@\+]?lock\s+(.*)\s*=\s*(.*)/i,
    lock: "connected builder+",
    exec: async (ctx, args) => {
      if (!ctx.socket.cid) return;
      const [obj, key] = args;
      const en = await Obj.get(ctx.socket.cid);

      if (!en) return;
      const targ = await target(en.dbobj, obj);
      if (!targ) return send([ctx.socket.id], "You can't lock that.");
      const tar = new Obj(targ);

      if (!canEdit(en.dbobj, tar.dbobj)) {
        return send([ctx.socket.id], "You can't lock that.");
      }
      if (tar && canEdit(en.dbobj, tar.dbobj)) {
        tar.dbobj.data ||= {};
        tar.dbobj.data.lock = key;
        await tar.save();
        send([ctx.socket.id], `You lock ${displayName(en.dbobj, tar.dbobj)}.`);
      }
    },
  });

  addCmd({
    name: "@unlock",
    pattern: /^[@\+]?unlock\s+(.*)/i,
    lock: "connected builder+",
    exec: async (ctx, args) => {
      const [obj] = args;
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      const targ = await target(en.dbobj, obj);
      if (!targ) return send([ctx.socket.id], "You can't unlock that.");
      const tar = new Obj(targ);

      if (!canEdit(en.dbobj, tar.dbobj)) {
        return send([ctx.socket.id], "You can't unlock that.");
      }

      tar.dbobj.data ||= {};
      tar.dbobj.data.lock = "";
      tar.save();
      send([ctx.socket.id], `You unlock ${displayName(en.dbobj, tar.dbobj)}.`);
    },
  });
};
