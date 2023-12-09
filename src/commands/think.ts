import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";

export default () =>
  addCmd({
    name: "think",
    pattern: /^think\s+(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => send([ctx.socket.id], args[0]),
  });
