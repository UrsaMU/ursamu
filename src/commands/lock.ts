import { Obj } from "../services/DBObjs/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { canEdit } from "../utils/canEdit.ts";
import { displayName } from "../utils/displayName.ts";
import { validateLock } from "../utils/evaluateLock.ts";
import { target } from "../utils/target.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () => {
  addCmd({
    name: "@lock",
    pattern: /^[@\+]?lock(?:\/(\w+))?\s+([^=]+)\s*=\s*(.*)/i,
    lock: "connected & builder+",
    exec: async (u: IUrsamuSDK) => {
      const [swtch, obj, key] = u.cmd.args;
      const en = await Obj.get(u.me.id);
      if (!en) return;

      const targ = await target(en.dbobj, obj);
      if (!targ) return send([u.socketId || ""], "You can't lock that.");
      const tar = new Obj(targ);

      if (!await canEdit(en.dbobj, tar.dbobj)) {
        return send([u.socketId || ""], "You can't lock that.");
      }
      if (!await validateLock(key)) {
        return send([u.socketId || ""], "Invalid lock string.");
      }

      tar.dbobj.data ||= {};
      if (swtch) {
        tar.dbobj.data.locks ||= {};
        (tar.dbobj.data.locks as Record<string, string>)[swtch.toLowerCase()] = key;
        send(
          [u.socketId || ""],
          `You lock ${displayName(en.dbobj, tar.dbobj, true)} (${swtch.toLowerCase()}).`
        );
      } else {
        tar.dbobj.data.lock = key;
        send([u.socketId || ""], `You lock ${displayName(en.dbobj, tar.dbobj, true)}.`);
      }
      await tar.save();
    },
  });

  addCmd({
    name: "@unlock",
    pattern: /^[@\+]?unlock(?:\/(\w+))?\s+(.*)/i,
    lock: "connected & builder+",
    exec: async (u: IUrsamuSDK) => {
      const [swtch, obj] = u.cmd.args;
      const en = await Obj.get(u.me.id);
      if (!en) return;
      const targ = await target(en.dbobj, obj);
      if (!targ) return send([u.socketId || ""], "You can't unlock that.");
      const tar = new Obj(targ);

      if (!await canEdit(en.dbobj, tar.dbobj)) {
        return send([u.socketId || ""], "You can't unlock that.");
      }

      tar.dbobj.data ||= {};
      if (swtch) {
        if (tar.dbobj.data.locks) {
          delete (tar.dbobj.data.locks as Record<string, string>)[swtch.toLowerCase()];
        }
        send(
          [u.socketId || ""],
          `You unlock ${displayName(en.dbobj, tar.dbobj, true)} (${swtch.toLowerCase()}).`
        );
      } else {
        tar.dbobj.data.lock = "";
        send([u.socketId || ""], `You unlock ${displayName(en.dbobj, tar.dbobj, true)}.`);
      }
      await tar.save();
    },
  });
};
