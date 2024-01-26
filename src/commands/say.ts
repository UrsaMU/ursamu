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

        // Send 'you say' to the enactor
        send([`#${ctx.socket.cid}`], `You say, "${args[1]}%cn"`, {});

        // Get a list of other players in the same location
        const othersInLocation = await dbojs.query({
          location: player.location,
          id: { $ne: ctx.socket.cid },
        });

        // Extract IDs of other players in the same location
        const otherIds = othersInLocation.map((p) => `#${p.id}`);

        // Send 'name says' to everyone else in the location
        if (otherIds.length > 0) {
          send(otherIds, `${name} says, "${args[1]}%cn"`, {});
        }
      }
    },
  });
