import { Obj, addCmd, dbojs, flags, send } from "../services";
import { IMStatEntry, allStats } from "../services/characters";
import { canEdit, moniker, setFlags, target } from "../utils";

// +stats <stat> = <value>

export default () => {
  addCmd({
    name: "stats",
    pattern: /^[@\+]?stat[s]?\s+(.*)\s*=\s*(.*)?$/i,
    lock: "connected !approved|admin+",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      let tar, tarObj;
      let specialty = "";
      let instance = "";

      let [stat, value] = args;

      const parts = stat.split("/");
      if (parts.length > 1) {
        tar = parts[0].trim().toLowerCase();
        stat = parts[1].trim().toLowerCase();
      }

      // Does the enactor have permission to edit the target if there is one?
      if (tar) {
        tarObj = await target(en.dbobj, tar.trim());
        if (tarObj && !canEdit(en.dbobj, tarObj)) {
          return send(
            [ctx.socket.id],
            "%chGame>%cn You cannot another's stats."
          );
        }
      }

      // Either use the target or the enactor if no target exists.
      tarObj = tarObj || en.dbobj;

      tarObj.data ||= {};
      tarObj.data.stats ||= [];

      // check to see if stat has an instance to it.
      const instanced = stat.match(/\((.*)\)/g);
      if (instanced) {
        stat = stat.replace(/\((.*)\)/g, "").trim();

        instance = instanced[0];
      }

      // get the full stat name from the partial name.
      const fullStat = allStats.find((s) =>
        s.name.toLowerCase().startsWith(stat!.toLowerCase().trim())
      );

      if (!fullStat) {
        return send([ctx.socket.id], "%chGame>%cn Invalid stat.");
      }

      // if fullStat isn't splat and splat isn't set, then error message.
      if (
        fullStat.name !== "splat" &&
        !tarObj.data.stats.find((s) => s.name === "splat")
      ) {
        return send(
          [ctx.socket.id],
          "%chGame>%cn You must set your splat first."
        );
      }

      // check to see  if the stat us even inatnaced.
      if (instance && !fullStat.hasInstance) {
        return send([ctx.socket.id], "%chGame>%cn Invalid instance().");
      }

      if (instance && fullStat.hasInstance && fullStat.instances?.length) {
        const inst = fullStat.instances?.find(
          (i) => i.toLowerCase() === instance.toLowerCase()
        );
        if (!inst) {
          return send([ctx.socket.id], "%chGame>%cn Invalid instance().");
        }
      }

      if (fullStat.hasInstance && !instance) {
        return send([ctx.socket.id], "%chGame>%cn Invalid instance().");
      }

      // check to see if the stat is locked.
      if (fullStat.lock && !flags.check(en.dbobj.flags || "", fullStat.lock)) {
        return send([ctx.socket.id], "%chGame>%cn Permission denied.");
      }

      // check to see if the instance is valid.

      // Check for specialities.
      // --------------------------------------------------------------------
      // ie.  when the value has a / in it.
      // ex:  +stats me/academics=1/library research
      if (value?.includes("/")) {
        const [value1, value2] = value.split("/");
        value = value1.trim();
        specialty = value2.trim().toLowerCase();
      }

      // if the stat has specialties, make sure the specialty is valid.
      if (fullStat.hasSpecialties && specialty) {
        const specObj = fullStat.specialties?.find((s) => s.name === specialty);

        if (!specObj && fullStat.specialties?.length) {
          return await send([ctx.socket.id], "%chGame>%cn Invalid specialty.");
        }

        if (specObj && specObj.values && !specObj.values.includes(value)) {
          return await send(
            [ctx.socket.id],
            "%chGame>%cn Invalid specialty value."
          );
        }
      }

      // Set the stats (or specialty!)!
      // --------------------------------------------------------------------
      if (instance) {
        stat = fullStat.name + instance;
      } else {
        stat = fullStat.name;
      }

      const name = specialty || stat;
      const type = specialty ? fullStat.name : fullStat.type;

      if (!value) {
        tarObj.data.stats = tarObj.data.stats.filter(
          (s: IMStatEntry) => s.name.toLowerCase() !== name
        );

        // remove any specialties that exist for this stat.
        if (fullStat.hasSpecialties) {
          tarObj.data.stats = tarObj.data.stats.filter(
            (s: IMStatEntry) => s.type !== fullStat.name
          );
        }

        await dbojs.update({ id: tarObj.id }, tarObj);
        return await send(
          [ctx.socket.id],
          `%chGame>%cn ${moniker(
            tarObj
          )}'s %ch${name.toUpperCase()}%cn deleted.`
        );
      }

      // does the user already have an instance of the stat?
      const statEntry = tarObj.data.stats.find((s) => s.name === name);

      if (statEntry) {
        statEntry.value = value;
        statEntry.temp = value;
      } else {
        tarObj.data.stats.push({
          name,
          value,
          temp: value,
          type,
          category: fullStat.category,
        });
      }

      await dbojs.update({ id: tarObj.id }, tarObj);

      return await send(
        [ctx.socket.id],
        `%chGame>%cn ${moniker(
          tarObj
        )}'s %ch${name.toUpperCase()}%cn set to: %ch${value}%cn`
      );
    },
  });
};
