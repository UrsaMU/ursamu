import { addCmd, flags, Obj, send } from "../../../services";
import { canEdit, capString, moniker, target } from "../../../utils";
import { IMStatEntry } from "../../../@types";
import { allStats, formatValue, setStat } from "../services";
import { getStat, statObj } from "../services";
import { IContext } from "../../../@types";

// +stats <stat> = <value>

export default () => {
  addCmd({
    name: "splat",
    pattern: /^[@\+]?splat\s+(.*)/i,
    lock: "connected !approved|storyteller+",
    category: "chargen",

    exec: async (ctx: IContext, args: string[]) => {
      let tar = "me",
        splat = "";
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      // if args[0] contains an =, then we need to split it up.
      if (args[0].includes("=")) {
        const parts = args[0].split("=");

        // if parts[0] does not equal me, then we need to check if the enactor is an admin.
        // if not, end the command and tell the enactor 'Permssion denied'
        if (
          parts[0].trim().toLowerCase() !== "me" &&
          !flags.check(en.flags, "storyteller+")
        ) {
          return send([ctx.socket.id], "%chGame>%cn Permission denied.");
        }

        if (parts.length > 1) {
          tar = parts[0].trim().toLowerCase();
          splat = parts[1].trim().toLowerCase();
        }
      } else {
        splat = args[0].trim().toLowerCase();
      }

      const targ = await target(en.dbobj, tar);
      if (!targ) return send([ctx.socket.id], "%chGame>%cn Invalid target.");

      const fullStat = allStats.find((s) => s.name === "splat");
      if (!fullStat) return send([ctx.socket.id], "%chGame>%cn Invalid stat.");

      if (!fullStat.values.includes(splat)) {
        return send(
          [ctx.socket.id],
          `%chGame>%cn Invalid splat. Must be one of: ${
            fullStat.values
              .map((s: any) => `%ch${capString(s)}%cn`)
              .join(", ")
          }`,
        );
      }

      if (targ.data?.stats?.find((s: IMStatEntry) => s.name === "splat")) {
        return send(
          [ctx.socket.id],
          `%chGame>%cn ${
            moniker(
              targ,
            )
          } already has a splat set. See: '%chhelp +stats/reset%cn'.`,
        );
      }

      try {
        const name = await setStat(targ, "splat", splat.trim());
        return await send(
          [ctx.socket.id],
          `%chGame>%cn ${
            moniker(targ)
          }'s splat set to: %ch${splat.trim()?.toUpperCase()}%cn.`,
        );
      } catch (error: any) {
        return send([ctx.socket.id], `%ch%crERROR>%cn ${error.message}`);
      }
    },
  });

  addCmd({
    name: "stats/reset",
    pattern: /^[@\+]?stats\/reset(?:\s+(.*))?$/i,
    lock: "connected !approved|admin+",
    category: "chargen",
    exec: async (ctx: IContext, args: string[]) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const tar = args[0] || "me";
      const targ = await target(en.dbobj, tar);
      if (!targ) return send([ctx.socket.id], "%chGame>%cn Invalid target.");

      if (!canEdit(en.dbobj, targ)) {
        return send([ctx.socket.id], "%chGame>%cn permission denied.");
      }

      if (!targ.data?.stats?.find((s: IMStatEntry) => s.name === "splat")) {
        return send(
          [ctx.socket.id],
          `%chGame>%cn ${
            moniker(
              targ,
            )
          } has no splat set. See: '%chhelp +splat%cn'.`,
        );
      }

      await send(
        [ctx.socket.id],
        "%chGame>%cn To confirm reset, type '%chstats/reset/confirm <target>%cn'",
      );
    },
  });

  addCmd({
    name: "stats/reset/confirm",
    pattern: /^[@\+]?stats\/reset\/confirm\s+(.*)$/i,
    lock: "connected !approved|admin+",
    hidden: true,
    exec: async (ctx: IContext, args: string[]) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const tar = args[0] || "me";
      const targ = await target(en.dbobj, tar);
      if (!targ) return send([ctx.socket.id], "%chGame>%cn Invalid target.");

      if (!canEdit(en.dbobj, targ)) {
        return send([ctx.socket.id], "%chGame>%cn permission denied.");
      }

      en.dbobj.data = {
        ...en.dbobj.data,
        stats: [],
        damage: {
          physical: { superficial: 0, aggravated: 0 },
          mental: { superficial: 0, aggravated: 0 },
        },
      };

      await en.save();
      return send(
        [ctx.socket.id],
        `%chGame>%cn ${moniker(targ)} has been reset.`,
      );
    },
  });

  addCmd({
    name: "stats",
    pattern: /^[@\+]?stat[s]?(?:\/(.*))?\s+(.*)\s*=\s*(.*)?$/i,
    category: "chargen",
    lock: "connected !approved|admin+",
    exec: async (ctx: IContext, args: string[]) => {
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
          `%chGame>%cn ${moniker(tarObj)} has no splat.`,
        );
      }

      // make sure if temp that it actually says 'temp'.
      if (temp && temp.toLowerCase() !== "temp") {
        return send(
          [ctx.socket.id],
          `%chGame>%cn Invalid temp value.  Must be 'temp'.`,
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
          }%cn`,
        );
      } catch (error: any) {
        return send([ctx.socket.id], "%chGame>%cn ${error.message}");
      }
    },
  });
};
