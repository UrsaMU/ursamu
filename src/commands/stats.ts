import { Obj, addCmd, send } from "../services";
import { allStats, formatValue, setStat } from "../services/characters";
import { canEdit, capString, moniker, target } from "../utils";
import { IMStatEntry } from "../@types";

// +stats <stat> = <value>

export default () => {
  addCmd({
    name: "splat",
    pattern: /^[@\+]?splat\s+(.*)/i,
    lock: "connected !approved|admin+",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const fullStat = allStats.find((s) => s.name === "splat");
      if (!fullStat) return send([ctx.socket.id], "%chGame>%cn Invalid stat.");

      if (!fullStat.values.includes(args[0].trim().toLowerCase())) {
        return send(
          [ctx.socket.id],
          `%chGame>%cn Invalid splat. Must be one of: ${fullStat.values
            .map((s) => `%ch${capString(s)}%cn`)
            .join(", ")}`
        );
      }

      if (en.dbobj.data?.stats?.find((s: IMStatEntry) => s.name === "splat")) {
        return send(
          [ctx.socket.id],
          `%chGame>%cn ${moniker(
            en.dbobj
          )} already has a splat set. To reset your character, use '%ch+stats/reset%cn' to start chargen over.`
        );
      }

      try {
        const name = await setStat(en.dbobj, "splat", args[0].trim());
        return await send(
          [ctx.socket.id],
          `%chGame>%cn ${moniker(en.dbobj)}'s splat set to: %ch${args[0]
            .trim()
            ?.toUpperCase()}%cn.`
        );
      } catch (error: any) {
        return send([ctx.socket.id], `%chGame>%cn ${error.message}`);
      }
    },
  });

  addCmd({
    name: "stats/reset",
    pattern: /^[@\+]?stats\/reset$/i,
    lock: "connected !approved|admin+",
    hidden: true,
    exec: async (ctx) =>
      send(
        [ctx.socket.id],
        "%chGame>%cn To confirm reset, type '%ch+stats/reset me=confirm%cn'"
      ),
  });

  addCmd({
    name: "stats/reset/confirm",
    pattern: /^[@\+]?stats\/reset\s+me\s*=\s*confirm$/i,
    lock: "connected !approved|admin+",
    hidden: true,
    exec: async (ctx) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      delete en.dbobj.data?.stats;
      await en.save();
      return send(
        [ctx.socket.id],
        "%chGame>%cn Your character has been reset.  Please re-do your character."
      );
    },
  });

  addCmd({
    name: "stats",
    pattern: /^[@\+]?stat[s]?(?:\/(.*))?\s+(.*)\s*=\s*(.*)?$/i,
    hidden: true,
    lock: "connected !approved|admin+",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      let tar;
      let [temp, stat, value] = args;
      // first peform some basic checks.
      // Make sure the character can edit the target.
      const parts = args[1].split("/");
      if (parts.length > 1) {
        tar = parts[0].trim().toLowerCase();
        stat = parts[1].trim().toLowerCase();
      }

      // Either use the target or the enactor if no target exists.
      const tarObj = tar ? await target(en.dbobj, tar) : en.dbobj;
      if (!tarObj) return send([ctx.socket.id], "%chGame>%cn Invalid target.");

      // Make sure the character can edit the target.
      if (!canEdit(en.dbobj, tarObj)) {
        return send([ctx.socket.id], "%chGame>%cn Invalid target.");
      }

      // Check to see if the target has a splat set first.
      if (
        !tarObj.data?.stats?.find((s: IMStatEntry) => s.name === "splat") &&
        stat !== "splat"
      ) {
        return send(
          [ctx.socket.id],
          `%chGame>%cn ${moniker(tarObj)} has no splat.`
        );
      }

      // make sure if temp that it actually says 'temp'.
      if (temp && temp.toLowerCase() !== "temp") {
        return send(
          [ctx.socket.id],
          `%chGame>%cn Invalid temp value.  Must be 'temp'.`
        );
      }

      try {
        const name = (await setStat(tarObj, stat, value, !!temp)) || stat;

        return await send(
          [ctx.socket.id],
          `%chGame>%cn ${moniker(tarObj)}'s stat %ch${
            temp ? "TEMP-" : ""
          }${name?.toUpperCase()}%cn set to: %ch${
            value ? formatValue(tarObj, name) : "%chremoved%cn"
          }%cn`
        );
      } catch (error: any) {
        return send([ctx.socket.id], `%chGame>%cn ${error.message}`);
      }
    },
  });
};
