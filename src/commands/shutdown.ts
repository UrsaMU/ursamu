import { dbojs } from "../services/Database/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { broadcast } from "../services/broadcast/index.ts";
import { setFlags } from "../utils/setFlags.ts";
import { wsService } from "../services/WebSocket/index.ts";

export default () =>
  addCmd({
    name: "@shutdown",
    pattern: /^@shutdown$/i,
    lock: "superuser+",
    exec: async (_ctx) => {
      await broadcast("Server shutting down...");
      
      // Forcefully disconnect all players
      const players = await dbojs.query({ flags: /connected/i });
      for (const player of players) {
        await setFlags(player, "!connected");
      }

      // Signal Telnet server to die
      // wsService.broadcast sends { msg, data }
      wsService.broadcast({
          event: "message", // The event name isn't strictly used by broadcast impl (it defaults to message structure), but sticking to interface
          payload: {
              msg: "",
              data: { shutdown: true }
          }
      });
      
      // Give time for the message to propagate
      setTimeout(() => {
          console.log("Shutting down via @shutdown command.");
          Deno.exit(0);
      }, 100);
    },
  });
