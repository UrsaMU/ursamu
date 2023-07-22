import { join } from "path";
import { broadcast } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { dbojs } from "../services/Database";

export default () =>
  addCmd({
    name: "reboot",
    pattern: /^@reboot|^@restart/g,
    lock: "connected admin+",
    exec: async (ctx) => {
      const player = await dbojs.findOne({ id: ctx.socket.cid });
      if (!player) return;
      broadcast(
        `%chGAME>%cn Server @reboot initiated by ${player.data?.name}...`,
        {}
      );

      process.exit(0);
    },
  });
