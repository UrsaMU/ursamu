import { addCmd } from "../services/commands/index.ts";
import { broadcast } from "../services/broadcast/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { setFlags } from "../utils/setFlags.ts";
import { wsService } from "../services/WebSocket/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () =>
  addCmd({
    name: "@shutdown",
    pattern: /^@shutdown$/i,
    lock: "superuser+",
    exec: async (_u: IUrsamuSDK) => {
      await broadcast("Server shutting down...");

      const players = await dbojs.query({ flags: /connected/i });
      for (const player of players) {
        await setFlags(player, "!connected");
      }

      wsService.broadcast({
        event: "message",
        payload: {
          msg: "",
          data: { shutdown: true },
        },
      });

      setTimeout(() => {
        console.log("Shutting down via @shutdown command.");
        Deno.exit(0);
      }, 100);
    },
  });
