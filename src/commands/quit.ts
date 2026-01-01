import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";

export default () =>
  addCmd({
    name: "quit",
    pattern: /^quit$/i,
    exec: async (ctx) => {
      await send([ctx.socket.id], "See You, Space Cowboy...", { quit: true });
      ctx.socket.disconnect(true);
    },
  });
