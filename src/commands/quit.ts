import { io } from "../app";
import { dbojs } from "../services/Database";
import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { flags } from "../services/flags/flags";
import { setFlags } from "../utils/setFlags";

export default () =>
  addCmd({
    name: "quit",
    pattern: /^quit$/i,
    exec: async (ctx) => {
      if (!ctx.socket.cid) return;
      const user = await dbojs.findOne({ id: ctx.socket.cid });
      if (!user) return;
      user.data ||= {};
      const { tags, data } = flags.set(user.flags, user.data, "!connected");

      user.flags = tags;
      user.data = data;
      console.log(user.id);
      await dbojs.update({ id: user.id }, user);

      send([ctx.socket.id], "See You, Space Cowboy...", { quit: true });
    },
  });
