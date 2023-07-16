import { Obj } from "../services/DBObjs";
import { dbojs } from "../services/Database";
import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { center, header, ljust, repeatString } from "../utils/format";

export default () => {
  addCmd({
    name: "who",
    pattern: /^[\+@]?who$/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const playersRaw = await dbojs.find({
        $and: [{ flags: /player/ }, { flags: /connected/ }],
      });

      const players = playersRaw
        .filter((p) => !p.flags.includes("dark"))
        .sort((a, b) => {
          const aName = a.data?.name || "";
          const bName = b.data?.name || "";
          return aName.localeCompare(bName);
        });

      let output = header("Who's Online");
      output +=
        "%ch NAME                 ALIAS      DOING%cn(@doing <doing>)\n";
      output += repeatString("%cr-%cn", 78);
      for (const pl of players) {
        const obj = await Obj.get(pl.id);
        if (!obj) continue;
        output += "\n " + ljust(`${obj.name}`, 20) + " ";
        output += ljust(`${obj.dbobj.data?.alias || ""}`, 10) + " ";
        output += ljust(`${obj.dbobj.data?.doing || ""}`, 45);
      }

      output += "\n" + repeatString("%cr-%cn", 78);
      output +=
        "\n" + center(`%ch${players.length}%cn players online`, 78) + "\n";
      output += repeatString("%cr=%cn", 78) + "\n";
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
