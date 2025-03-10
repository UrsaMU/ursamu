import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";

export default () =>
  addCmd({
    name: "pose",
    pattern: /^(pose\s+|:|;)\s*(.*)/i,
    lock: "connected",
    category: "Communication",
    exec: async (ctx, args) => {
      const player = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!player) return;
      const name = player.data?.moniker || player.data?.name;
      const msg = args[0] === ";"
        ? `${name}${args[1]}%cn`
        : `${name} ${args[1]}%cn`;

      send([`#${player.location}`], msg, {});
    },
  });
