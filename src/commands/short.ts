import { dbojs } from "../services/Database";
import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";

export default () =>
  addCmd({
    name: "shortdesc",
    lock: "connected",
    pattern: /^[@\+]?short\s+(.*)/i,
    exec: async (ctx, args) => {
      const en = await dbojs.findOne({ id: ctx.socket.cid });
      if (!en) return;

      en.data ||= {};
      en.data.shortdesc = args[0].trim();
      await dbojs.update({ id: en.id }, en);
      send([ctx.socket.id], `Your short description has been updated.`, {});
    },
  });
