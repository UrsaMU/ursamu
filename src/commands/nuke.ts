import { addCmd } from "../services/commands/index.ts";
import { dbojs, chans, mail, counters } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { broadcast } from "../services/broadcast/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () =>
  addCmd({
    name: "nuke",
    pattern: /^@nuke(?:\s+(.*))?$/i,
    lock: "superuser",
    exec: async (u: IUrsamuSDK) => {
      const confirm = (u.cmd.args[0] || "").trim().toLowerCase();
      const socketId = u.socketId || "";

      if (confirm !== "confirm") {
        send([socketId], "%ch%cr--- WARNING ---%cn");
        send([socketId], "This will %ch%crPERMANENTLY DELETE%cn the entire database:");
        send([socketId], "  - All players (except you — you'll be recreated)");
        send([socketId], "  - All rooms, things, and exits");
        send([socketId], "  - All channels");
        send([socketId], "  - All mail");
        send([socketId], "");
        send([socketId], "Type %ch@nuke confirm%cn to proceed.");
        send([socketId], "%ch%crThis cannot be undone.%cn");
        return;
      }

      // Broadcast warning
      broadcast("%ch%cr[SYSTEM]%cn Database nuke initiated. Server will restart momentarily.");

      // Clear all collections
      const objects = await dbojs.all();
      for (const obj of objects) {
        await dbojs.delete({ id: obj.id });
      }

      const channels = await chans.all();
      for (const ch of channels) {
        await chans.delete({ id: ch.id });
      }

      const mails = await mail.all();
      for (const m of mails) {
        await mail.delete({ id: m.id });
      }

      const ctrs = await counters.all();
      for (const c of ctrs) {
        await counters.delete({ id: c.id });
      }

      send([socketId], "%ch%cgDatabase wiped.%cn Server will restart to reinitialize.");
      send([socketId], "You will need to create a new superuser on restart.");

      // Trigger restart after a brief delay
      setTimeout(() => Deno.exit(75), 500); // exit code 75 signals reboot
    },
  });
