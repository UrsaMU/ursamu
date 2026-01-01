import { Obj } from "../services/DBObjs/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { idle, moniker } from "../utils/index.ts";
import { header, ljust, repeatString } from "../utils/format.ts";

export default () => {
  addCmd({
    name: "who",
    pattern: /^[\+@]?who$/i,
    lock: "connected",
    exec: async (ctx, _args) => {
      // ============================== Online Players ===============================
      // Player                 Alias    Type    Idle  Doing  (Type: @doing <txt>)
      // -----------------------------------------------------------------------------
      // Player1                P1       Player  12m   Some stuff
      // Player2                foob     Player  0     Some other stuff
      // Player3                P3       Player  0     Saving the world.
      // -----------------------------------------------------------------------------
      // 3 players online

      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const playersRaw = await dbojs.query({
        $and: [{ flags: /player/ }, { flags: /connected/ }],
      });

      const players = playersRaw
        .filter((p) => !p.flags.includes("dark"))
        .sort((a, b) => {
          const aName = a.data?.name || "";
          const bName = b.data?.name || "";
          return aName.localeCompare(bName);
        });

      let output = header("Who's Online") + "\n";
      output +=
        "%ch Player                  Alias    Type       Idle  Doing  (Type: @doing <txt>)%cn\n";
      output += repeatString("%cr-%cn", 78) + "\n";
      for (const pl of players) {
        const obj = await Obj.get(pl.id);
        if (!obj) continue;
        output += " " + ljust(moniker(obj), 23) + " ";
        output += ljust((obj.data?.alias as string) || "", 8) + " ";
        if (obj.flags.includes("storyteller")) {
          output += ljust("%ch%cgStoryteller%cn", 10) + " ";
        } else if (obj.flags.includes("admin")) {
          output += ljust("%ch%cyAdmin%cn", 10) + " ";
        } else if (obj.flags.includes("superuser")) {
          output += ljust("%ch%ccDev%cn", 10) + " ";
        } else {
          output += ljust("Player", 10) + " ";
        }

        output += ljust(idle((obj.data?.lastCommand as number) || 0), 6);
        output += ljust((obj.data?.doing as string) || "", 23) + "\n";
      }

      output += repeatString("%cr-%cn", 78) + "\n";
      output +=
        " " + ljust(`%ch${players.length}%cn players online`, 78) + "\n";
      output += repeatString("%cr=%cn", 78);
      send([ctx.socket.id], output);
    },
  });

  addCmd({
    name: "doing",
    pattern: /^[\+@]?doing(?:\s+(.*))?$/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const doing = args[0];
      if (!doing) {
        send([ctx.socket.id], "@doing cleared.");
        delete en.dbobj.data?.doing;
        await en.save();
        return;
      }

      en.dbobj.data ||= {};
      en.dbobj.data.doing = doing;
      await en.save();
      send([ctx.socket.id], `You are now doing: %ch${doing}%cn.`);
    },
  });
};
