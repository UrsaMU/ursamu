import { IDBOBJ } from "../@types/IDBObj.ts";
import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd, force } from "../services/commands/index.ts";
import { target } from "../utils/target.ts";
import { moniker } from "../utils/moniker.ts";
import { canEdit } from "../utils/canEdit.ts";
import { displayName } from "../utils/displayName.ts";
import { getNextId } from "../utils/getNextId.ts";

export default () => {
  addCmd({
    name: "@dig",
    pattern: /^[@/+]?dig(\/.*)?\s+([^=]+)(?:\s*=\s*([^,]+))?(?:,\s*(.*))?/i,
    lock: "connected builder+",
    help: "Dig a room",
    category: "building",
    exec: async (ctx, args) => {
      const [swtch, room, to, from] = args;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;

      // Dig the room.
      let id = await getNextId("objid");
      console.log(id);
      let obj: IDBOBJ = {
        id,
        data: {
          name: room,
        },
        flags: "room",
      };
      const roomObj = await dbojs.create(obj);
      send(
        [ctx.socket.id],
        `Room ${room} created with dbref %ch#${roomObj.id}%cn.`,
        {},
      );

      // If to exit exits, dig it.
      if (to) {
        id = await getNextId("objid");
        obj = {
          id,
          location: en.location,
          data: {
            name: to,
            destination: roomObj.id,
          },
          flags: "exit",
        };

        const toObj = await dbojs.create(obj);
        send(
          [ctx.socket.id],
          `Exit ${to.split(";")[0]} created with dbref %ch#${toObj.id}%cn.`,
          {},
        );
      }

      // from exit exits, dig it.
      if (from) {
        id = await getNextId("objid");
        obj = {
          id,
          location: roomObj.id,
          data: {
            name: from,
            destination: en.location,
          },
          flags: "exit",
        };

        const fromObj = await dbojs.create(obj);
        send(
          [ctx.socket.id],
          `Exit ${from.split(";")[0]} created with dbref %ch#${fromObj.id}%cn.`,
          {},
        );
      }

      // tel them there if needed.
      if (swtch?.toLowerCase() == "teleport") {
        force(ctx, `teleport #${roomObj.id}`);
      }
    },
  });

  addCmd({
    name: "@teleport",
    category: "building",
    help: "Teleport an object",
    pattern:
      /^[@/+]?t(?:e|el|ele|elep|elepo|elepor|eleport)?\s+(.*)\s*=\s*(.*)/i,
    lock: "connected builder+",
    exec: async (ctx, args) => {
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;

      const tar = await target(en, args[0].trim(), true);
      const locObj = await target(en, args[1].trim(), true);

      if (!tar) {
        send([ctx.socket.id], `Could not find %ch${args[0].trim()}%cn.`, {});
        return;
      }

      if (!locObj) {
        send([ctx.socket.id], `Could not find %ch${args[1].trim()}%cn.`, {});
        return;
      }

      tar.location = locObj.id;
      await dbojs.modify({ id: tar.id }, "$set", tar);

      send(
        [ctx.socket.id],
        `You teleport ${moniker(tar)} to %ch${displayName(en, locObj)}%cn.`,
        {},
      );
      send(
        [`#${tar.id}`],
        `You are teleported to %ch${displayName(en, locObj)}%cn.`,
        {},
      );
      send(
        [`#${tar.data?.location}`],
        `%ch${moniker(en)}%cn teleports out.`,
        {},
      );
      ctx.socket.join(`#${locObj.id}`);
      send([`#${locObj.id}`], `%ch${moniker(en)}%cn teleports in.`, {});
      force(ctx, "look");
    },
  });

  addCmd({
    name: "@destroy",
    pattern: /^[@/+]?destroy(?:\/(.*))?\s+(.*)/i,
    lock: "connected builder+",
    help: "Destroy an object",
    category: "building",
    exec: async (ctx, args) => {
      const [swtch, name] = args;

      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;

      const obj = await target(en, name, true);

      if (!obj || !canEdit(en, obj)) {
        return send([ctx.socket.id], "You can't destroy that.", {});
      }
      if (
        obj &&
        obj.flags.includes("safe") &&
        swtch?.toLowerCase() !== "override"
      ) {
        return send(
          [ctx.socket.id],
          "You can't destroy that. It's safe. Try using the 'override' switch.",
          {},
        );
      }

      if (obj.flags.includes("void")) {
        return send(
          [ctx.socket.id],
          "You can't destroy that. It's the void.",
          {},
        );
      }

      // send the player home if they're in a place that's being destroyed.
      if (obj && obj.id === en.location) {
        en.location = en.data?.home || 1;
        await dbojs.modify({ id: en.id }, "$set", en);
        await send([ctx.socket.id], "You are sent home.", {});
        await force(ctx, "look");
      }

      await dbojs.delete({ _id: obj._id });
      send([ctx.socket.id], `You destroy ${displayName(en, obj)}.`, {});
      const exits = await dbojs.query({
        $and: [
          {
            $or: [{ "data.destination": obj.id }, { location: obj.id }],
          },
          { flags: new RegExp("exit") },
        ],
      });

      // destroy any exits that would be orphaned.
      for (const exit of exits) {
        await dbojs.delete({ _id: exit._id });
      }
    },
  });

  addCmd({
    name: "@open",
    category: "building",
    help: "Open an exit",
    pattern: /^[@/+]?open\s+(.*)\s*=\s*(.*)/i,
    lock: "connected builder+",
    exec: async (ctx, args) => {
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;
      const [name, room] = args.map((a) => a.trim());
      let roomObj: IDBOBJ | undefined | null;

      if (room) roomObj = await target(en, room, true);
      if (!roomObj) {
        return send([ctx.socket.id], `Could not find %ch${room}%cn.`, {});
      }

      const id = await getNextId("objid");

      const exit = await dbojs.create({
        id,
        flags: "exit",
        location: en.location,
        data: {
          name: name,
          destination: roomObj.id,
        },
      });

      if (roomObj) {
        send(
          [ctx.socket.id],
          `You open exit %ch${displayName(en, exit)} to ${
            displayName(
              en,
              roomObj,
            )
          }.`,
          {},
        );
      } else {
        send([ctx.socket.id], `You open exit ${displayName(en, exit)}.`, {});
      }
    },
  });
};
