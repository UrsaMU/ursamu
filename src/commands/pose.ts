import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { dbojs } from "../services/Database";

export default () =>
  addCmd({
    name: "pose",
    pattern: /^(pose\s+|:|;)\s*(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const player = await dbojs.findOne({ id: ctx.socket.cid });
      if (!player) return;
      const name = player.data?.moniker || player.data?.name;
      const msg = args[0] === ";"
        ? `${name}${args[1]}%cn`
        : `${name} ${args[1]}%cn`;

      send([`#${player.location}`], msg, {});
    },
  });
