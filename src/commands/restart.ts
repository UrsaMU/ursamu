import { broadcast } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";

export default () =>
  addCmd({
    name: "reboot",
    pattern: /^@reboot|^@restart/g,
    lock: "connected admin+",
    exec: async (ctx) => {
      const cid = ctx.socket.cid;
      if (!cid) return;
      const player = await dbojs.queryOne({ id: cid });
      if (!player) return;
      broadcast(
        `%chGame>%cn Server @reboot initiated by ${player.data?.name}...`,
        {}
      );

      const rebootContent = `// This file is modified by the @reboot command to trigger a restart\nexport const rebootId = ${Date.now()};\n`;
      try {
          await Deno.writeTextFile("src/reboot.ts", rebootContent);
      } catch (e) {
          console.error("Failed to trigger reboot:", e);
          broadcast(`%chGame>%cn Reboot failed: ${e}`, {});
      }
    },
  });
