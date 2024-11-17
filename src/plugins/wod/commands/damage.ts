import { addCmd, dbojs, flags, Obj, send } from "../../../services";
import { moniker, target } from "../../../utils";
import { calculateDamage } from "../services/damage";

export default () => {
  addCmd({
    name: "damage",
    pattern: /^[@\+]?damage\s+(.*)/i,
    lock: "connected approved|storyteller+",
    category: "rp",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const parts = args[0].split("/");
      let tar = "me",
        type = "physical",
        value = "1s",
        damName = "superficial";

      if (parts.length > 1) {
        tar = parts[0].trim().toLowerCase();
      }

      if (parts.length > 1) {
        [type, value] = parts[1].split("=");
        type = type.trim().toLowerCase();
        value = value.trim().toLowerCase();
      } else {
        [type, value] = parts[0].split("=");
        type = type.trim().toLowerCase();
        value = value?.trim().toLowerCase() || "1s";
      }

      if (tar !== "me" && !flags.check(en.flags, "storyteller+")) {
        return send([ctx.socket.id], "%chGame>%cn Permission denied.");
      }

      const targ = await target(en.dbobj, tar);
      if (!targ || !targ.data) {
        return send([ctx.socket.id], "%ch%cgDamage>%cn Invalid target.");
      }

      if ("mental".includes(type.toLowerCase())) {
        type = "mental";
      } else if ("physical".includes(type.toLowerCase())) {
        type = "physical";
      } else {
        return send(
          [ctx.socket.id],
          `%ch%crDamage>%cn Invalid type. Must be one of: physical, mental`,
        );
      }

      const val = value.split(/([0-9]+)/)[1];
      const damageType = value.split(/([a-zA-Z]+)/)[1].toLowerCase();
      if (isNaN(parseInt(val))) {
        return send([ctx.socket.id], "%chGame>%cn Invalid value.");
      }

      if ("superficial".includes(damageType.toLowerCase())) {
        damName = "superficial";
      } else if ("aggravated".includes(damageType.toLowerCase())) {
        damName = "aggravated";
      } else {
        return send(
          [ctx.socket.id],
          `%ch%crDamage>%cn Invalid damage type. Must be one of: superficial, aggravated`,
        );
      }

      const damaged = parseInt(val);

      // Initialize damage structure if it doesn't exist
      if (!targ.data.damage) {
        targ.data.damage = {};
      }
      if (!targ.data.damage[type]) {
        targ.data.damage[type] = {
          superficial: 0,
          aggravated: 0,
        };
      }

      // Calculate new damage state
      const result = await calculateDamage(
        targ,
        damName === "superficial" ? damaged : 0,
        damName === "aggravated" ? damaged : 0,
        type,
      );

      // Update the damage values
      if (damName === "superficial") {
        targ.data.damage[type].superficial += damaged;
      } else {
        targ.data.damage[type].aggravated += damaged;
      }

      // Update the target
      const updateData = {
        data: targ.data,
        location: targ.location,
        flags: targ.flags,
      };
      await dbojs.update({ id: targ.id }, { $set: updateData });

      // Send message with status if applicable
      const statusMsg = result.status ? ` (%ch%cr${result.status}%cn)` : "";
      send(
        [`#${targ.location}`],
        `%ch%crDamage>%cn ${
          moniker(targ)
        } has taken %ch%cr${damaged}%cn %ch${damName}%cn damage(${type})${statusMsg}.`,
      );
    },
  });
};
