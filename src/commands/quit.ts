import { io } from "../app";
import { dbojs } from "../services/Database";
import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { set } from "../utils/set";

export default () =>
  addCmd({
    name: "quit",
    pattern: "quit",
    exec: async (ctx) => {
      if (ctx.socket.cid) {
        const user = await dbojs.findOne({ id: ctx.socket.cid });
        if (user) await set(user, "!connected");
      }
      send([ctx.socket.id], "See You, Space Cowboy...", { quit: true });
      setTimeout(() => io.to(ctx.socket.id).disconnectSockets(true), 100);
    },
  });
