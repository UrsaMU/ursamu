import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";

export default () =>
  addCmd({
    name: "say",
    pattern: /^(say\s+|")(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const player = await dbojs.queryOne({ id: ctx.socket.cid });
      if (player) {
        const name = player.data?.moniker || player.data?.name;
        send([`#${player.location}`], `${name} says, "${args[1]}%cn"`, {});
      }
    },
  });
