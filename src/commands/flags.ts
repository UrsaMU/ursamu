import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { flags } from "../services/flags/flags.ts";
import { displayName } from "../utils/displayName.ts";
import { setFlags } from "../utils/setFlags.ts";
import { target } from "../utils/target.ts";

export default () =>
  addCmd({
    name: "@flags",
    pattern: /^@flags\s+(.*)\s*=\s*(.*)?$/i,
    lock: "connected admin+",
    exec: async (ctx, args) => {
      const [tar, flgs] = args;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
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
