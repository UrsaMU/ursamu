import type { IDBOBJ } from "../@types/IDBObj.ts";
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
      if (!ctx.socket.cid) return;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;
      
      // Quota Check
      let cost = 1; // Room
      if (to) cost++;
      if (from) cost++;
      
      const quota = (en.data?.quota as number) || 0;
      // Admins (wizard+) usually ignore quota, but for MVP let's enforce or check flags
      const isStaff = en.flags.includes("wizard") || en.flags.includes("admin");
      
      if (!isStaff && quota < cost) {
          return send([ctx.socket.id], `You don't have enough quota. Cost: ${cost}, You have: ${quota}.`, {});
      }

      if (!isStaff && en.data) {
          en.data.quota = quota - cost;
          await dbojs.modify({ id: en.id }, "$set", en);
      }

      // Dig the room.
      let id = await getNextId("objid");
      let obj: IDBOBJ = {
        id,
        data: {
          name: room,
          owner: en.id // Ensure owner is set!
        },
        flags: "room",
      };
      const roomObj = await dbojs.create(obj);
      send(
        [ctx.socket.id],
        `Room ${room} created with dbref %ch#${roomObj.id}%cn.`,
        {}
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
            owner: en.id
          },
          flags: "exit",
        };

        const toObj = await dbojs.create(obj);
        send(
          [ctx.socket.id],
          `Exit ${to.split(";")[0]} created with dbref %ch#${toObj.id}%cn.`,
          {}
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
            owner: en.id
          },
          flags: "exit",
        };

        const fromObj = await dbojs.create(obj);
        send(
          [ctx.socket.id],
          `Exit ${from.split(";")[0]} created with dbref %ch#${fromObj.id}%cn.`,
          {}
        );
      }

      // tel them there if needed.
      // tel them there if needed.
      if (swtch && (swtch.toLowerCase() === "/teleport" || swtch.toLowerCase() === "/tel")) {
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
      if (!ctx.socket.cid) return;
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

      const canSeeLoc =
        (locObj ? await canEdit(en, locObj) : false) ||
        locObj.flags.includes("enter_ok");

      send(
        [ctx.socket.id],
        `You teleport ${moniker(tar)} to %ch${displayName(en, locObj, canSeeLoc)}%cn.`,
        {}
      );
      send(
        [`#${tar.id}`],
        `You are teleported to %ch${displayName(en, locObj, canSeeLoc)}%cn.`,
        {}
      );
      send(
        [`#${tar.data?.location}`],
        `%ch${moniker(en)}%cn teleports out.`,
        {}
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
      if (!ctx.socket.cid) return;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;

      const obj = await target(en, name, true);

      if (!obj || !await canEdit(en, obj))
        return send([ctx.socket.id], "You can't destroy that.", {});
      if (
        obj &&
        obj.flags.includes("safe") &&
        swtch?.toLowerCase() !== "override"
      )
        return send(
          [ctx.socket.id],
          "You can't destroy that. It's safe. Try using the 'override' switch.",
          {}
        );

      if (obj.flags.includes("void")) {
        return send(
          [ctx.socket.id],
          "You can't destroy that. It's the void.",
          {}
        );
      }

      // send the player home if they're in a place that's being destroyed.
      if (obj && obj.id === en.location) {
        // deno-lint-ignore no-explicit-any
        en.location = (en.data as any)?.home || 1;
        await dbojs.modify({ id: en.id }, "$set", en);
        await send([ctx.socket.id], "You are sent home.", {});
        await force(ctx, "look");
      }

      await dbojs.delete({ id: obj.id });
      send([ctx.socket.id], `You destroy ${displayName(en, obj, true)}.`, {});
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
        await dbojs.delete({ id: exit.id });
      }
    },
  });

  addCmd({
    name: "@open",
    category: "building",
    help: "Open an exit",
    pattern: /^[@/+]?open(?:\/(.*))?\s+([^=]+)\s*=\s*([^,]+)(?:,\s*(.*))?/i,
    lock: "connected builder+",
    exec: async (ctx, args) => {
      if (!ctx.socket.cid) return;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;
      const [swtch, name, room, backExit] = args.map((a) => a?.trim());
      let roomObj: IDBOBJ | undefined | null | false;

      if (room) roomObj = await target(en, room, true);
      if (!roomObj) {
        return send([ctx.socket.id], `Could not find %ch${room}%cn.`, {});
      }
      
      // Quota Check
      let cost = 1;
      if (backExit) cost++;
      
      const quota = (en.data?.quota as number) || 0;
      const isStaff = en.flags.includes("wizard") || en.flags.includes("admin");
      
      if (!isStaff && quota < cost) {
          return send([ctx.socket.id], `You don't have enough quota. Cost: ${cost}, You have: ${quota}.`, {});
      }

      if (!isStaff && en.data) {
          en.data.quota = quota - cost;
          await dbojs.modify({ id: en.id }, "$set", en);
      }

      const id = await getNextId("objid");
      const location = swtch?.toLowerCase() === "inventory" ? en.id : en.location;

      const exit = await dbojs.create({
        id,
        flags: "exit",
        location: location,
        data: {
          name: name,
          destination: roomObj.id,
          owner: en.id
        },
      });

      const canSeeRoom = roomObj ? await canEdit(en, roomObj) : false;
      send(
        [ctx.socket.id],
        `You open exit %ch${displayName(en, exit, true)} to ${displayName(
          en,
          roomObj,
          canSeeRoom
        )}.`,
        {}
      );

      // Handle back exit
      if (backExit) {
        const backId = await getNextId("objid");
        const backExitObj = await dbojs.create({
            id: backId,
            flags: "exit",
            location: roomObj.id,
            data: {
                name: backExit,
                destination: en.location,
                owner: en.id
            },
        });
        
        const sourceLoc = en.location ? await dbojs.queryOne({id: en.location}) : en;
        const canSeeSource = sourceLoc ? await canEdit(en, sourceLoc) : false;
        send([ctx.socket.id], `You open exit %ch${displayName(en, backExitObj, true)} to ${displayName(en, sourceLoc || en, canSeeSource)}.`, {});
      }
    },
  });

  addCmd({
    name: "@link",
    category: "building",
    help: "Link an exit or room",
    pattern: /^[@/+]?link\s+(.*)\s*=\s*(.*)/i,
    lock: "connected builder+",
    exec: async (ctx, args) => {
      if (!ctx.socket.cid) return;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;
      const [name, targetRoom] = args.map((a) => a.trim());
      
      const obj = await target(en, name, true);
      if (!obj) {
        return send([ctx.socket.id], `Could not find %ch${name}%cn.`, {});
      }

      // If it's a room, we link the dropto
      if (obj.flags.includes("room")) {
        const roomTarget = await target(en, targetRoom, true);
        if (!roomTarget) {
            return send([ctx.socket.id], `Could not find %ch${targetRoom}%cn.`, {});
        }
        
        const canSeeTarget = await canEdit(en, roomTarget);
        obj.data ||= {};
        obj.data.dropto = roomTarget.id;
        await dbojs.modify({ id: obj.id }, "$set", obj);
        return send([ctx.socket.id], `You link ${displayName(en, obj, true)} to ${displayName(en, roomTarget, canSeeTarget)}.`, {});
      }

      // If it's an exit, we link the destination
      if (obj.flags.includes("exit")) {
        const roomTarget = await target(en, targetRoom, true);
        if (!roomTarget) {
            return send([ctx.socket.id], `Could not find %ch${targetRoom}%cn.`, {});
        }
        
        const canSeeTarget = await canEdit(en, roomTarget);
        obj.data ||= {};
        obj.data.destination = roomTarget.id;
        await dbojs.modify({ id: obj.id }, "$set", obj);
         return send([ctx.socket.id], `You link ${displayName(en, obj, true)} to ${displayName(en, roomTarget, canSeeTarget)}.`, {});
      }

      // For everything else (players, things), we link the home
      const homeTarget = await target(en, targetRoom, true);
      if (!homeTarget) {
        return send(
          [ctx.socket.id],
          `Could not find %ch${targetRoom}%cn.`,
          {}
        );
      }

      const canSeeTarget =
        (await canEdit(en, homeTarget)) ||
        homeTarget.flags.includes("link_ok");
        
      if (!canSeeTarget) {
        return send([ctx.socket.id], "You can't link to that.", {});
      }

      obj.data ||= {};
      obj.data.home = homeTarget.id;
      await dbojs.modify({ id: obj.id }, "$set", obj);
      return send(
        [ctx.socket.id],
        `You link ${displayName(en, obj, true)} to ${displayName(
          en,
          homeTarget,
          canSeeTarget
        )}.`,
        {}
      );
    },
  });

  addCmd({
    name: "@unlink",
    category: "building",
    help: "Unlink an exit or room",
    pattern: /^[@/+]?unlink\s+(.*)/i,
    lock: "connected builder+",
    exec: async (ctx, args) => {
      if (!ctx.socket.cid) return;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;
      const [name] = args.map((a) => a.trim());
      
      const obj = await target(en, name, true);
      if (!obj) {
        return send([ctx.socket.id], `Could not find %ch${name}%cn.`, {});
      }

      // If it's a room, we unlink the dropto
      if (obj.flags.includes("room")) {
        obj.data ||= {};
        delete obj.data.dropto;
        await dbojs.modify({ id: obj.id }, "$set", obj);
        return send([ctx.socket.id], `You unlink ${displayName(en, obj)}.`, {});
      }

      // If it's an exit, we unlink the destination
      if (obj.flags.includes("exit")) {
        obj.data ||= {};
        delete obj.data.destination;
        await dbojs.modify({ id: obj.id }, "$set", obj);
        return send([ctx.socket.id], `You unlink ${displayName(en, obj)}.`, {});
      }

      send([ctx.socket.id], "You can only unlink rooms or exits.", {});
    }
  });

  addCmd({
    name: "@parent",
    category: "building",
    help: "Set the parent of an object",
    pattern: /^[@/+]?parent\s+(.*)\s*=\s*(.*)/i,
    lock: "connected builder+",
    exec: async (ctx, args) => {
      if (!ctx.socket.cid) return;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;
      const [name, parentName] = args.map((a) => a.trim());
      
      const obj = await target(en, name, true);
      if (!obj) {
          return send([ctx.socket.id], `Could not find %ch${name}%cn.`, {});
      }
      
      const parentObj = await target(en, parentName, true);
      if (!parentObj) {
           return send([ctx.socket.id], `Could not find %ch${parentName}%cn.`, {});
      }
      
      // Check for circular reference?
      // MUX usually prevents A->B->A.
      let curr: IDBOBJ | undefined = (parentObj as IDBOBJ);
      let count = 0;
      while(curr && count < 20) {
          if (curr.id === obj.id) {
              return send([ctx.socket.id], "Circular parent reference detected.", {});
          }
          // deno-lint-ignore no-explicit-any
          const pId: string = (curr.data as any).parent;
          if (!pId) break;
          const next: IDBOBJ | false = await dbojs.queryOne({id: pId.replace("#", "")});
          curr = next || undefined;
          count++;
      }

      obj.data ||= {};
      obj.data.parent = "#" + parentObj.id;
      
      await dbojs.modify({ id: obj.id }, "$set", obj);
      send([ctx.socket.id], `Parent of ${displayName(en, obj, true)} set to ${displayName(en, parentObj, true)}.`, {});
    }
  });

  addCmd({
    name: "@parent/clear",
    category: "building",
    help: "Clear the parent of an object",
    pattern: /^[@/+]?parent\/clear\s+(.*)/i,
    lock: "connected builder+",
    exec: async (ctx, args) => {
       if (!ctx.socket.cid) return;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;
      const name = args[0].trim();
      
      const obj = await target(en, name, true);
      if (!obj) {
          return send([ctx.socket.id], `Could not find %ch${name}%cn.`, {});
      }
      
      obj.data ||= {};
      delete obj.data.parent;
      
      await dbojs.modify({ id: obj.id }, "$set", obj);
      send([ctx.socket.id], `Parent cleared for ${displayName(en, obj, true)}.`, {});
    }
  });

  addCmd({
    name: "@create",
    pattern: /^@create\s+(.*)/i,
    lock: "connected builder+",
    help: "Create a thing",
    category: "building",
    exec: async (ctx, args) => {
      const [name] = args;
      if (!ctx.socket.cid) return;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;

      // Quota Check
      const cost = 1;
      const quota = (en.data?.quota as number) || 0;
      const isStaff = en.flags.includes("wizard") || en.flags.includes("admin");
      
      if (!isStaff && quota < cost) {
          return send([ctx.socket.id], `You don't have enough quota. Cost: ${cost}, You have: ${quota}.`, {});
      }

      if (!isStaff && en.data) {
          en.data.quota = quota - cost;
          await dbojs.modify({ id: en.id }, "$set", en);
      }
      
      const parts = name.split("=");
      const objName = parts[0];
      const objCost = parts[1] ? parseInt(parts[1]) : 0; 

      const id = await getNextId("objid");
      const obj: IDBOBJ = {
        id,
        location: en.id, // Inventory
        flags: "thing",
        data: {
          name: objName,
          owner: en.id,
          value: objCost
        }
      };

      await dbojs.create(obj);
      send([ctx.socket.id], `You create ${objName}.`, {});
    }
  });
};
