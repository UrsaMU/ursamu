import { dbojs } from "../services/Database";
import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { flags } from "../services/flags/flags";
import { displayName } from "../utils/displayName";
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

      obj.data ||= {};

      const { tags, data } = flags.set(obj.flags, obj.data, flgs);
      obj.flags = tags;
      obj.data = data;

      await dbojs.update({ _id: obj._id }, obj);
      send([ctx.socket.id], `Flags set on %ch${displayName(en, obj)}%cn.`, {});
    },
  });
