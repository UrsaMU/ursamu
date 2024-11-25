import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { dbojs } from "../services/Database";

export default () =>
  addCmd({
    name: "say",
    pattern: /^(say\s+|")(.*)/i,
    lock: "connected",
    category: "Communication",
    exec: async (ctx, args) => {
      const player = await dbojs.findOne({ id: ctx.socket.cid });
      if (player) {
        const name = player.data?.moniker || player.data?.name;
        send([`#${player.location}`], `${name} says, "${args[1]}%cn"`, {});
      }
    },
  });
