import { Obj, addCmd, send } from "../services";
import { IMStatEntry, formatValue, setStat } from "../services/characters";
import { canEdit, moniker, target } from "../utils";
import { getStat } from "../services/characters/getStats";

// +stats <stat> = <value>

export default () => {
  addCmd({
    name: "stats",
    pattern: /^[@\+]?stat[s]?(?:\/(.*))?\s+(.*)\s*=\s*(.*)?$/i,
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
