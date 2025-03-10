import { addCmd } from "../services/commands/index.ts";
import { Obj } from "../services/DBObjs/DBObjs.ts";
import { send } from "../services/broadcast/index.ts";

export default () => {
  addCmd({
    name: "ooc",
    pattern: /^ooc\s*([;:].+|.*)/i,
    lock: "connected",
    category: "Communication",
    exec: async (ctx, args) => {
      const player = await Obj.get(ctx.socket.cid);
      if (!player) return;

      // Add null check for args[1]
      const message = args[0] || "";
      const displayName = player.name;

      // If message is empty, return early
      if (!message) return;

      switch (true) {
        case message.startsWith(":"):
          await send(
            [`#${player.location}`],
            `%cy<%crOOC%cy>%cn ${displayName} ${message.slice(1).trim()}`,
          );
          break;
        case message.startsWith(";"):
          await send(
            [`#${player.location}`],
            `%cy<%crOOC%cy>%cn ${displayName}${message.slice(1).trim()}`,
          );
          break;
        case message.startsWith('"'):
          await send(
            [`#${player.location}`],
            `%cy<%crOOC%cy>%cn ${displayName} says, "${message}"`,
          );
          break;
        default:
          await send(
            [`#${player.location}`],
            `%cy<%crOOC%cy>%cn ${displayName} says, "${message}"`,
          );
          break;
      }
    },
  });
};
