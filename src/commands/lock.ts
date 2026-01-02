import { Obj } from "../services/DBObjs/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { canEdit } from "../utils/canEdit.ts";

import { displayName } from "../utils/displayName.ts";
import { validateLock } from "../utils/evaluateLock.ts";
import { target } from "../utils/target.ts";

export default () => {
  addCmd({
    name: "@lock",
    pattern: /^[@\+]?lock(?:\/(\w+))?\s+([^=]+)\s*=\s*(.*)/i,
    lock: "connected builder+",
    exec: async (ctx, args) => {
      if (!ctx.socket.cid) return;
      const [swtch, obj, key] = args;
      const en = await Obj.get(ctx.socket.cid);

      if (!en) return;
      const targ = await target(en.dbobj, obj);
      if (!targ) return send([ctx.socket.id], "You can't lock that.");
      const tar = new Obj(targ);

      if (!await canEdit(en.dbobj, tar.dbobj)) {
        return send([ctx.socket.id], "You can't lock that.");
      }
      if (!await validateLock(key)) {
        return send([ctx.socket.id], "Invalid lock string.");
      }

      tar.dbobj.data ||= {};
      if (swtch) {
        tar.dbobj.data.locks ||= {};
        // safe cast as we know data exists
        (tar.dbobj.data.locks as Record<string,string>)[swtch.toLowerCase()] = key;
        send([ctx.socket.id], `You lock ${displayName(en.dbobj, tar.dbobj, true)} (${swtch.toLowerCase()}).`);
      } else {
        tar.dbobj.data.lock = key;
        send([ctx.socket.id], `You lock ${displayName(en.dbobj, tar.dbobj, true)}.`);
      }
      await tar.save();
    },
  });

  addCmd({
    name: "@unlock",
    pattern: /^[@\+]?unlock(?:\/(\w+))?\s+(.*)/i,
    lock: "connected builder+",
    exec: async (ctx, args) => {
      const [swtch, obj] = args;
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      const targ = await target(en.dbobj, obj);
      if (!targ) return send([ctx.socket.id], "You can't unlock that.");
      const tar = new Obj(targ);

      if (!await canEdit(en.dbobj, tar.dbobj)) {
        return send([ctx.socket.id], "You can't unlock that.");
      }

      tar.dbobj.data ||= {};
      if (swtch) {
        if (tar.dbobj.data.locks) {
             delete (tar.dbobj.data.locks as Record<string,string>)[swtch.toLowerCase()];
        }
        send([ctx.socket.id], `You unlock ${displayName(en.dbobj, tar.dbobj, true)} (${swtch.toLowerCase()}).`);
      } else {
        tar.dbobj.data.lock = "";
        send([ctx.socket.id], `You unlock ${displayName(en.dbobj, tar.dbobj, true)}.`);
      }
      await tar.save();
    },
  });
};
