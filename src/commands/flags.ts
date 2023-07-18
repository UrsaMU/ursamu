import { dbojs } from "../services/Database";
import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { flags } from "../services/flags/flags";
import { displayName } from "../utils/displayName";
import { setFlags } from "../utils/setFlags";
import { target } from "../utils/target";

export default () =>
  addCmd({
    name: "@flags",
    pattern: /^@flags\s+(.*)\s*=\s*(.*)?$/i,
    lock: "connected admin+",
    exec: async (ctx, args) => {
      const [tar, flgs] = args;
      const en = await dbojs.findOne({ id: ctx.socket.cid });
      if (!en) return;

      const obj = await target(en, tar, true);
      if (!obj) {
        send([ctx.socket.id], `No such object.`, {});
        return;
      }

      await setFlags(obj, flgs);
      send([ctx.socket.id], `Flags set on %ch${displayName(en, obj)}%cn.`, {});
    },
  });
