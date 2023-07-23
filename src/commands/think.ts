import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";

export default () =>
  addCmd({
    name: "think",
    pattern: /^think\s+(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => send([ctx.socket.id], args[0]),
  });
