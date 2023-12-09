import { join } from "node:path";
import { broadcast } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";

export default () =>
  addCmd({
    name: "reboot",
    pattern: /^@reboot|^@restart/g,
    lock: "connected admin+",
    exec: async (ctx) => {
      const player = await dbojs.findOne({ id: ctx.socket.cid });
      if (!player) return;
      broadcast(
        `%chGame>%cn Server @reboot initiated by ${player.data?.name}...`,
        {}
      );

      process.exit(0);
    },
  });
