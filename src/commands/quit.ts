import { io } from "../app.ts";
import { dbojs } from "../services/Database";
import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";

export default () =>
  addCmd({
    name: "quit",
    pattern: /^quit$/i,
    exec: async (ctx) => {
      await send([ctx.socket.id], "See You, Space Cowboy...", { quit: true });
      ctx.socket.disconnect(true);
    },
  });
