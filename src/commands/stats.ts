import { Obj, addCmd, flags, send } from "../services";
import { allStats, setStat } from "../services/characters";
import { moniker, setFlags } from "../utils";

// +stats <stat> = <value>

export default () => {
  addCmd({
    name: "splat",
    pattern: /^[@\+]?splat\s+(.*)$/i,
    lock: "connected !approved|admin+",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      en.dbobj.flags ||= "";

      const splat = args[0].trim().toLowerCase();
      const fullFlag = flags.exists(splat);
      console.log(fullFlag);

      if (!fullFlag) {
        return send([ctx.socket.id], "%chGame>%cn Invalid splat.");
      }
      await setFlags(en.dbobj, "!mortal !ghoul !vampire !werewolf !kinfolk");
      await setFlags(en.dbobj, splat);

      return send(
        [ctx.socket.id],
        `%chGame>%cn ${moniker(en.dbobj)} is now a %ch${splat}%cn.`
      );
    },
  });

  addCmd({
    name: "stats",
    pattern: /^[@\+]?stat[s]?\s+(.*)\s*=\s*(.*)?$/i,
    lock: "connected !approved|admin+",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      if (
        !flags.check(
          en.dbobj.flags || "",
          "werewolf|vampire|ghoul|kinfolk|mortal"
        )
      ) {
        return send(
          [ctx.socket.id],
          "%chGame>%cn You must set your splat first."
        );
      }

      en.dbobj.data ||= {};
      en.dbobj.data.stats ||= {};

      let [stat, value] = args;

      const fullStatName = allStats.find((s) =>
        s.name.toLowerCase().startsWith(stat!.toLowerCase())
      )?.name;

      if (!fullStatName) {
        return send([ctx.socket.id], "%chGame>%cn Invalid stat.");
      }

      stat = fullStatName;

      const current = en.dbobj.data.stats[stat!] || 0;

      value = value?.trim();

      switch (true) {
        case /^\-/.test(value) || /^\+/.test(value):
          console.log("Woot!");
          try {
            value = current + +value.replace(" ", "");
            await setStat(en.dbobj, stat, value);

            return send(
              [ctx.socket.id],
              `%chGame>%cn  ${moniker(
                en.dbobj
              )}'s %ch${stat.toUpperCase()}%cn set to: %ch${value}%cn.`
            );
          } catch (e: any) {
            return send([ctx.socket.id], `%chGame>%cn ${e.message}`);
          }

        default:
          try {
            await setStat(en.dbobj, stat, value);
            if (!value) {
              return send(
                [ctx.socket.id],
                `%chGame>%cn ${moniker(
                  en.dbobj
                )}'s %ch${stat.toUpperCase()}%cn removed.`
              );
            } else {
              return send(
                [ctx.socket.id],
                `%chGame>%cn ${moniker(
                  en.dbobj
                )}'s %ch${stat.toUpperCase()}%cn set to: %ch${value}%cn.`
              );
            }
          } catch (e: any) {
            return send([ctx.socket.id], `%chGame>%cn ${e.message}`);
          }
      }
    },
  });
};
