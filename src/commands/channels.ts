import { IMSocket } from "../@types/index.ts";
import { IChanEntry } from "../@types/Channels.ts";
import { io } from "../app.ts";
import { Obj } from "../services/DBObjs/index.ts";
import { chans, dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd, force } from "../services/commands/index.ts";
import { flags } from "../services/flags/flags.ts";
import { joinChans } from "../utils/index.ts";
import { ljust } from "../utils/format.ts";
import { getNextId } from "../utils/getNextId.ts";

export default () => {
  addCmd({
    name: "@ccreate",
    pattern: /^@ccreate\s+(.*)/i,
    lock: "connected admin+",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await dbojs.queryOne({ id: ctx.socket.cid! });
      if (!en) return;

      const channel = await chans.queryOne({
        name: new RegExp(args[0].split("=")[0], "i"),
      });

      if (!channel) {
        const parts = args[0].split("=");
        const name = parts[0];
        const alias = parts[1];

        const chan = await chans.create({
          id: await getNextId("chanid"),
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
          await dbojs.modify({ id: en.id }, "$set", en);
          ctx.socket.join(name);
          await force(ctx, `${alias} :joins the channel.`);
          send(
            [ctx.socket.id],
            `You have joined ${name} with the alias '${alias}'.`,
            {}
          );

          // Force the connected sockets (players) to cycle their channels
          // and join the new ones.
          const sockets = Array.from(io.sockets.sockets.values()).map(
            (s) => s as IMSocket
          );

          for (const socket of sockets) {
            await joinChans({ socket });
          }
        }
      } else {
        send(
          [ctx.socket.id],
          `Channel ${args[0].split("=")[0]} already exists.`,
          {}
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
      const chan = await chans.queryOne({ name: new RegExp(args[0], "i") });

      if (chan) {
        const players = await dbojs.query({ flags: /player/ });
        for (const plyr of players) {
          plyr.data ||= {};
          plyr.data.channels = plyr.data.channels?.filter(
            (c: IChanEntry) => c.channel !== chan.name
          );
          await dbojs.modify({ id: plyr.id }, "$set", plyr);
        }
        await chans.delete({ id: chan.id });
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
      const chan = await chans.queryOne({ name: new RegExp(args[0], "i") });
      if (chan) {
        const key = args[1].toLowerCase();
        const val = args[2];
        if (key === "alias") {
          chan.alias = val;
          await chans.modify({ id: chan.id }, "$set", chan);
          send([ctx.socket.id], `Channel %ch${chan.name}%cn updated.`, {});
        } else if (key === "header") {
          chan.header = val;
          await chans.modify({ id: chan.id }, "$set", chan);
          send([ctx.socket.id], `Channel %ch${chan.name}%cn updated.`, {});
        } else if (key === "hidden") {
          chan.hidden = !!val;
          await chans.modify({ id: chan.id }, "$set", chan);
          send([ctx.socket.id], `Channel %ch${chan.name}%cn updated.`, {});
        } else if (key === "name") {
          const taken = await chans.queryOne({ name: new RegExp(val, "i") });
          if (!taken) {
            chan.name = val;
            await chans.modify({ id: chan.id }, "$set", chan);
            send([ctx.socket.id], `Channel %ch${chan.name}%cn updated.`, {});
          } else {
            send([ctx.socket.id], `Channel ${val} already exists.`, {});
          }
        } else if (key === "lock") {
          chan.lock = val;
          await chans.modify({ id: chan.id }, "$set", chan);
          send([ctx.socket.id], `Channel %ch${chan.name}%cn updated.`, {});
        } else if (key === "masking") {
          chan.masking = val.toLocaleLowerCase() === "true" ? true : false;
          await chans.modify({ id: chan.id }, "$set", chan);
          send([ctx.socket.id], `Channel %ch${chan.name}%cn updated.`, {});
        } else {
          send([ctx.socket.id], `Invalid setting ${key}.`, {});
        }
      } else {
        send([ctx.socket.id], `Channel %ch${args[0]}%cn not found.`, {});
      }

      // Force the connected sockets (players) to cycle their channels
      // and join the new ones.
      const sockets = Array.from(io.sockets.sockets.values()).map(
        (s) => s as IMSocket
      );

      for (const socket of sockets) {
        await joinChans({ socket });
      }
    },
  });

  addCmd({
    name: "addcom",
    pattern: /^addcom\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const chan = await chans.queryOne({ name: new RegExp(args[1], "i") });

      if (chan) {
        const en = await dbojs.queryOne({ id: ctx.socket.cid! });
        if (!en) return;
        if (!flags.check(en.flags || "", chan.lock || "")) {
          send([ctx.socket.id], "Permission denied.", {});
          return;
        }
        en.data ||= {};
        en.data.channels ||= [];
        en.data.channels.push({
          channel: chan.name,
          alias: args[0],
          active: true,
        });

        await dbojs.modify({ id: en.id }, "$set", en);
        send([ctx.socket.id], `You join channel ${chan.name}.`, {});
        ctx.socket.join(chan.name);
        await force(ctx, `${args[0]} :joins the channel.`);
        send(
          [ctx.socket.id],
          `You have joined ${chan.name} with the alias '%ch${args[0]}%cn'.`,
          {}
        );
      } else {
        send([ctx.socket.id], `Channel ${args[1]} not found.`, {});
      }
    },
  });

  addCmd({
    name: "delcom",
    pattern: /^delcom\s+(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await dbojs.queryOne({ id: ctx.socket.cid! });
      if (!en) return;
      en.data ||= {};
      en.data.channels ||= [];
      en.data.channels.forEach(async (c: IChanEntry) => {
        if (c.alias !== args[0]) return;
        en.data!.channels = en.data?.channels?.filter(
          (c: IChanEntry) => c.alias !== args[0]
        );
        send([ctx.socket.id], `You leave channel ${c.channel}.`, {});
        await force(ctx, `${args[0]} :leaves the channel.`);
        (ctx.socket as any).leave(c.channel);
        await dbojs.modify({ id: en.id }, "$set", en);
      });
    },
  });

  addCmd({
    name: "comlist",
    pattern: /^comlist/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await dbojs.queryOne({ id: ctx.socket.cid! });
      if (!en) return;
      en.data ||= {};
      en.data.channels ||= [];
      let msg = "Your channels:%r";
      msg +=
        "%ch%cr==============================================================================%cn%r";
      msg += ` ALIAS         CHANNEL        STATUS    TITLE           MASK             %r`;
      msg +=
        "%ch%cr==============================================================================%cn";
      
      for (const c of en.data.channels) {
        const channel = await chans.queryOne({ name: c.channel });
        const status = c.active ? "Active" : "Inactive";
        const title = c.title || "";
        const mask = c.mask || "";
        
        msg += `\n ${ljust(c.alias, 14)}`;
        msg += `${ljust(c.channel, 14)}`;
        msg += `${ljust(status, 10)}`;
        msg += `${ljust(title, 16)}`;
        msg += `${ljust(mask, 16)}`;
      }

      send([ctx.socket.id], msg, {});
    },
  });

  addCmd({
    name: "comtitle",
    pattern: /^comtitle\s+(.*)\s*=\s*(.*)$/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      if (!ctx.socket.cid) return;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;

      en.data ||= {};
      en.data.channels ||= [];
      let updated = false;
      
      for (let i = 0; i < en.data.channels.length; i++) {
        const c = en.data.channels[i];
        if (c.alias === args[0]) {
          en.data.channels[i].title = args[1].trim();
          if (en.data.channels[i].title === "") delete en.data.channels[i].title;
          updated = true;
        }
      }
      
      if (updated) {
        await dbojs.modify({ id: en.id }, "$set", en);
        send([ctx.socket.id], `Channel title updated.`, {});
      } else {
        send([ctx.socket.id], `Channel alias ${args[0]} not found.`, {});
      }
    },
  });

  addCmd({
    name: "commask",
    pattern: /^commask\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await dbojs.queryOne({ id: ctx.socket.cid! });
      if (!en) return;

      en.data ||= {};
      en.data.channels ||= [];
      const chansList = en.data.channels.filter(
        (c: IChanEntry) => c.alias === args[0]
      );

      if (chansList.length === 0) {
        send([ctx.socket.id], `Channel alias %ch${args[0]}%cn not found.`, {});
        return;
      }

      let updated = false;
      for (let i = 0; i < en.data.channels.length; i++) {
        const c = en.data.channels[i];
        if (c.alias === args[0]) {
          const channel = await chans.queryOne({ name: c.channel });
          if (!channel) {
            send([ctx.socket.id], `Channel ${c.channel} not found.`, {});
            continue;
          }
          
          if (!channel.masking) {
            send(
              [ctx.socket.id],
              `Channel %ch${c.channel}%cn does not allow masking.`,
              {}
            );
            continue;
          }
          
          en.data.channels[i].mask = args[1];
          updated = true;
        }
      }
      
      if (updated) {
        await dbojs.modify({ id: en.id }, "$set", en);
        send([ctx.socket.id], `Channel mask updated.`, {});
      }
    },
  });
};
