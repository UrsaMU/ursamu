import { IMSocket } from "../@types";
import { IChanEntry } from "../@types/Channels";
import { io } from "../app";
import { Obj } from "../services/DBObjs";
import { chans, dbojs } from "../services/Database";
import { send } from "../services/broadcast";
import { addCmd, force } from "../services/commands";
import { flags } from "../services/flags/flags";
import { joinChans } from "../utils";
import { ljust } from "../utils/format";

export default () => {
  addCmd({
    name: "@ccreate",
    pattern: /^@ccreate\s+(.*)/i,
    lock: "connected admin+",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await dbojs.findOne({ id: ctx.socket.cid });
      if (!en) return;

      const channel = await chans.findOne({
        name: RegExp(args[0].split("=")[0], "i"),
      });

      if (!channel) {
        const parts = args[0].split("=");
        const name = parts[0];
        const alias = parts[1];

        const chan = chans.insert({
          name,
          header: `%ch[${name}]%cn`,
          hidden: false,
          alias,
        });

        send([ctx.socket.id], `Channel %ch${name}%cn created.`, {});

        if (alias) {
          en.data ||= {};
          en.data.channels ||= [];
          en.data.channels.push({
            channel: name,
            alias,
            active: true,
          });

          const updateData = {
            data: en.data,
            flags: en.flags,
            location: en.location,
          };

          await dbojs.update({ id: en.id }, { $set: updateData });
          ctx.socket.join(name);
          await force(ctx, `${alias} :joins the channel.`);
          send(
            [ctx.socket.id],
            `You have joined ${name} with the alias '${alias}'.`,
            {},
          );

          // Force the connected sockets (players) to cycle their channels
          // and join the new ones.
          const sockets = Array.from(io.sockets.sockets.entries()).map(
            (s) => s[1] as IMSocket,
          );

          for (const socket of sockets) {
            await joinChans({ socket });
          }
        }
      } else {
        send(
          [ctx.socket.id],
          `Channel ${args[1].split("=")[0]} already exists.`,
          {},
        );
      }
    },
  });

  addCmd({
    name: "@cdelete",
    pattern: /^@cdelete\s+(.*)/i,
    lock: "connected admin+",
    hidden: true,
    exec: async (ctx, args) => {
      const chan = await chans.findOne({ name: RegExp(args[0], "i") });

      if (chan) {
        const players = await dbojs.find({ flags: /player/ });
        for (const plyr of players) {
          plyr.data ||= {};
          plyr.data.channels = plyr.data.channels?.filter(
            (c: IChanEntry) => c.channel !== chan.name,
          );

          const updateData = {
            data: plyr.data,
            flags: plyr.flags,
            location: plyr.location,
          };

          await dbojs.update({ id: plyr.id }, { $set: updateData });
        }
        await chans.remove({ id: chan.id });
        send([ctx.socket.id], `Channel %ch${chan.name}%cn deleted.`, {});
      } else {
        send([ctx.socket.id], `Channel ${args[0]} not found.`, {});
      }
    },
  });

  addCmd({
    name: "@cset",
    pattern: /^[@\+]?cset\s+(.*)\/(.*)\s*=\s*(.*)?/i,
    lock: "connected admin+",
    hidden: true,
    exec: async (ctx, args) => {
      const chan = await chans.findOne({ name: RegExp(args[0], "i") });
      if (chan) {
        const key = args[1].toLowerCase();
        const val = args[2];
        const updateData: any = {};

        if (key === "alias") {
          updateData.alias = val;
        } else if (key === "header") {
          updateData.header = val;
        } else if (key === "hidden") {
          updateData.hidden = !!val;
        } else if (key === "name") {
          const taken = await chans.findOne({ name: RegExp(val, "i") });
          if (!taken) {
            updateData.name = val;
          } else {
            send([ctx.socket.id], `Channel ${val} already exists.`, {});
            return;
          }
        } else if (key === "lock") {
          updateData.lock = val;
        } else if (key === "masking") {
          updateData.masking = val.toLocaleLowerCase() === "true";
        } else {
          send([ctx.socket.id], `Invalid setting ${key}.`, {});
          return;
        }

        await chans.update({ id: chan.id }, { $set: updateData });
        send([ctx.socket.id], `Channel %ch${chan.name}%cn updated.`, {});

        // Force the connected sockets (players) to cycle their channels
        // and join the new ones.
        const sockets = Array.from(io.sockets.sockets.entries()).map(
          (s) => s[1] as IMSocket,
        );

        for (const socket of sockets) {
          await joinChans({ socket });
        }
      } else {
        send([ctx.socket.id], `Channel %ch${args[0]}%cn not found.`, {});
      }
    },
  });

  addCmd({
    name: "addcom",
    pattern: /^addcom\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const chan = await chans.findOne({ name: RegExp(args[0], "i") });

      if (chan) {
        const en = await dbojs.findOne({ id: ctx.socket.cid });
        if (!en) return;
        if (!flags.check(en.flags || "", chan.lock || "")) {
          send([ctx.socket.id], "Permission denied.", {});
          return;
        }
        en.data ||= {};
        en.data.channels ||= [];
        en.data.channels.push({
          channel: chan.name,
          alias: args[1],
          active: true,
        });

        const updateData = {
          data: en.data,
          flags: en.flags,
          location: en.location,
        };

        await dbojs.update({ id: en.id }, { $set: updateData });
        send([ctx.socket.id], `You join channel ${chan.name}.`, {});
        ctx.socket.join(chan.name);
        await force(ctx, `${chan.alias} :joins the channel.`);
        send(
          [ctx.socket.id],
          `You have joined ${chan.name} with the alias '%ch${args[1]}%cn'.`,
          {},
        );
      } else {
        send([ctx.socket.id], `Channel ${args[0]} not found.`, {});
      }
    },
  });

  addCmd({
    name: "delcom",
    pattern: /^delcom\s+(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await dbojs.findOne({ id: ctx.socket.cid });
      if (!en) return;
      en.data ||= {};
      en.data.channels ||= [];
      en.data.channels.forEach(async (c: IChanEntry) => {
        if (c.alias !== args[0]) return;
        en.data!.channels = en.data?.channels?.filter(
          (c: IChanEntry) => c.alias !== args[0],
        );
        send([ctx.socket.id], `You leave channel ${c.channel}.`, {});
        await force(ctx, `${args[0]} :leaves the channel.`);
        ctx.socket.leave(c.channel);

        const updateData = {
          data: en.data,
          flags: en.flags,
          location: en.location,
        };

        await dbojs.update({ id: en.id }, { $set: updateData });
      });
    },
  });

  addCmd({
    name: "comlist",
    pattern: /^comlist/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid!);
      if (!en) return;
      en.dbobj.data ||= {};
      en.dbobj.data.channels ||= [];
      let msg = "Your channels:%r";
      msg +=
        "%ch%cr==============================================================================%cn%r";
      msg +=
        ` ALIAS         CHANNEL        STATUS    TITLE           MASK             %r`;
      msg +=
        "%ch%cr==============================================================================%cn";
      en.dbobj.data.channels.forEach((c: IChanEntry) => {
        msg += `\n ${ljust(c.alias, 14)}`;
        msg += `${ljust(c.channel, 14)}`;
      });

      send([en.dbref], msg);
    },
  });

  addCmd({
    name: "comtitle",
    pattern: /^comtitle\s+(.*)\s*=\s*(.*)$/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      if (!ctx.socket.cid) return;
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      en.dbobj.data ||= {};
      en.dbobj.data.channels ||= [];
      en.dbobj.data.channels.forEach(async (c: IChanEntry) => {
        if (c.alias !== args[0]) return;
        c.title = args[1].trim();
        if (c.title === "") delete c.title;
        await en.save();
        send([ctx.socket.id], `Channel ${c.channel} title updated.`);
      });
    },
  });

  addCmd({
    name: "commask",
    pattern: /^commask\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid!);
      if (!en) return;

      en.dbobj.data ||= {};
      en.dbobj.data.channels ||= [];
      const chansList = en.dbobj.data.channels.filter(
        (c: IChanEntry) => c.alias === args[0],
      );

      if (chansList.length === 0) {
        send([ctx.socket.id], `Channel %ch${args[0]}%cn not found.`);
        return;
      }

      chansList.forEach(async (c: IChanEntry) => {
        const channel = await chans.findOne({ name: c.channel });
        if (!channel) {
          return send([ctx.socket.id], `Channel ${c.channel} not found.`);
        }

        if (!channel.masking) {
          return send(
            [ctx.socket.id],
            `Channel %ch${c.channel}%cn does not allow masking.`,
          );
        }

        c.mask = args[1];
        await en.save();
        send([ctx.socket.id], `Channel ${c.channel} mask updated.`);
      });
    },
  });
};
