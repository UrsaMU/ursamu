import { IMStatEntry } from "../@types";
import { getStat } from "../plugins/wod/services";
import { Obj, addCmd, dbojs, flags, send } from "../services";

import { moniker, target } from "../utils";

export default () => {
  addCmd({
    name: "heal",
    // +heal <target>/<physical|mental>=<value><type>
    pattern: /^[@\+]?heal\s+(.*)/i,
    lock: "connected approved|storyteller+",
    category: "rp",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      // split args[0] into three parts, the target the type the value and damageType.
      // If there is no target, then the target is 'me'
      // If there is no type, then the type is 'physical'
      // If there is no value, then the value is 1s.

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

      // if the target is not 'me' and the enactor is not a storyteller+, then end the command and tell the enactor 'Permission denied'
      if (tar !== "me" && !flags.check(en.flags, "storyteller+")) {
        return send([ctx.socket.id], "%chGame>%cn Permission denied.");
      }

      const targ = await target(en.dbobj, tar);
      if (!targ || !targ.data)
        return send([ctx.socket.id], "%ch%cgHeal>%cn Invalid target.");

      // if the type is not 'physical' or 'mental', then end the command and tell the enactor 'Invalid type. Must be one of: physical, mental'
      if (
        "physical".includes(type.toLowerCase()) &&
        "mental".includes(type.toLowerCase())
      ) {
        return send(
          [ctx.socket.id],
          `%ch%crHeal>%cn Invalid type. Must be one of: physical, mental`
        );
      }

      if ("mental".includes(type.toLowerCase())) {
        type = "mental";
      } else if ("physical".includes(type.toLowerCase())) {
        type = "physical";
      } else {
        return send(
          [ctx.socket.id],
          `%ch%crHeal>%cn Invalid type. Must be one of: physical, mental`
        );
      }

      // seperate the number from the string in value.
      // if the value is not a number, then end the command and tell the enactor 'Invalid value.'
      const val = value.split(/([0-9]+)/)[1];
      const damageType = value.split(/([a-zA-Z]+)/)[1].toLowerCase();
      if (isNaN(parseInt(val))) {
        return send([ctx.socket.id], "%chGame>%cn Invalid value.");
      }

      // if the damageType is partially or fully equal to   'superficial' or 'aggravated', then end the command and tell the enactor 'Invalid damage type. Must be one of: superficial, aggravated'
      if (
        "superficial".includes(damageType.toLowerCase()) &&
        "aggravated".includes(damageType.toLowerCase())
      ) {
        return send(
          [ctx.socket.id],
          `%ch%crHeal>%cn Invalid damage type. Must be one of: superficial, aggravated`
        );
      }

      if ("superficial".includes(damageType.toLowerCase())) {
        damName = "superficial";
      } else {
        damName = "aggravated";
      }

      const healed = parseInt(val);
      // heal the target.  If it's superficial, then heal superficial.  If it's aggravated, then heal aggravated.
      // if the heal is larger than the damage type to be healed, then end the command and tell the enactor 'Invalid value.  You cannot heal more.'

      if (healed > targ.data.damage[type][damName]) {
        return send([ctx.socket.id], `%ch%crHeal>%cn Invalid amount.`);
      }

      if (healed > 0) {
        if (damName === "superficial") {
          targ.data.damage[type].superficial -= healed;
        } else {
          targ.data.damage[type].aggravated -= healed;
        }
      }

      // send a message to the targets location.  Heal> <target> has healed <value> <type> <damageType>. enactor or not.
      send(
        [`#${targ.location}`],
        `%ch%cgHeal>%cn ${moniker(
          targ
        )} has healed %ch%cg${healed}%cn %ch${damName}%cn damage(${type}).`
      );

      // update the target.
      const updateData = {
        data: targ.data,
        location: targ.location,
        flags: targ.flags
      };
      await dbojs.update({ id: targ.id }, { $set: updateData });
    },
  });

  addCmd({
    name: "damage",
    // +damage <target>/<physical|mental>=<value><type>
    pattern: /^[@\+]?damage\s+(.*)/i,
    lock: "connected approved|storyteller+",
    category: "rp",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      // split args[0] into three parts, the target the type the value and damageType.
      // If there is no target, then the target is 'me'
      // If there is no type, then the type is 'physical'
      // If there is no value, then the value is 1s.

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

      // if the target is not 'me' and the enactor is not a storyteller+, then end the command and tell the enactor 'Permission denied'
      if (tar !== "me" && !flags.check(en.flags, "storyteller+")) {
        return send([ctx.socket.id], "%chGame>%cn Permission denied.");
      }

      const targ = await target(en.dbobj, tar);
      if (!targ || !targ.data)
        return send([ctx.socket.id], "%ch%cgDamage>%cn Invalid target.");

      // if the type is not 'physical' or 'mental', then end the command and tell the enactor 'Invalid type. Must be one of: physical, mental
      if ("mental".includes(type.toLowerCase())) {
        type = "mental";
      } else if ("physical".includes(type.toLowerCase())) {
        type = "physical";
      } else {
        return send(
          [ctx.socket.id],
          `%ch%crDamage>%cn Invalid type. Must be one of: physical, mental`
        );
      }

      // seperate the number from the string in value.
      // if the value is not a number, then end the command and tell the enactor 'Invalid value.'
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
          `%ch%crDamage>%cn Invalid damage type. Must be one of: superficial, aggravated`
        );
      }

      const damaged = parseInt(val);
      const superficial = +targ.data.damage[type].superficial;
      const aggravated = +targ.data.damage[type].aggravated;
      const maxHealth = +(await getStat(targ, "stamina")) + 3;

      // emit a message to the targets location.  Damage> <target> has taken <value> <type> damage(<damageType>). enactor or not.
      send(
        [`#${targ.location}`],
        `%ch%crDamage>%cn ${moniker(
          targ
        )} has taken %ch%cr${damaged}%cn %ch${damName}%cn damage(${type}).`
      );
    },
  });
};
