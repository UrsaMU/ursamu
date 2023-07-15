import { IChanEntry } from "../@types/Channels";
import { chans, dbojs } from "../services/Database";
import { send } from "../services/broadcast";
import { addCmd, force } from "../services/commands";
import { flags } from "../services/flags/flags";

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
          await dbojs.update({ _id: en._id }, en);
          ctx.socket.join(name);
          await force(ctx, `${alias} :joins the channel.`);
          send(
            [ctx.socket.id],
            `You have joined ${name} with the alias '${alias}'.`,
            {}
          );
        }
      } else {
        send(
          [ctx.socket.id],
          `Channel ${args[1].split("=")[0]} already exists.`,
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
      const chan = await chans.findOne({ name: RegExp(args[0], "i") });

      if (chan) {
        const players = await dbojs.find({ flags: /player/ });
        for (const plyr of players) {
          plyr.data ||= {};
          plyr.data.channels = plyr.data.channels?.filter(
            (c: IChanEntry) => c.channel !== chan.name
          );
          await dbojs.update({ id: plyr.id }, plyr);
        }
        await chans.remove({ _id: chan._id });
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
        if (key === "alias") {
          chan.alias = val;
          await chans.update({ _id: chan._id }, chan);
          send([ctx.socket.id], `Channel %ch${chan.name}%cn updated.`, {});
        } else if (key === "header") {
          chan.header = val;
          await chans.update({ _id: chan._id }, chan);
          send([ctx.socket.id], `Channel %ch${chan.name}%cn updated.`, {});
        } else if (key === "hidden") {
          chan.hidden = !!val;
          await chans.update({ _id: chan._id }, chan);
          send([ctx.socket.id], `Channel %ch${chan.name}%cn updated.`, {});
        } else if (key === "name") {
          const taken = await chans.findOne({ name: RegExp(val, "i") });
          if (!taken) {
            chan.name = val;
            await chans.update({ _id: chan._id }, chan);
            send([ctx.socket.id], `Channel %ch${chan.name}%cn updated.`, {});
          } else {
            send([ctx.socket.id], `Channel ${val} already exists.`, {});
          }
        } else if (key === "alias") {
          chan.alias = val;
          await chans.update({ _id: chan._id }, chan);
          send([ctx.socket.id], `Channel %ch${chan.name}%cn updated.`, {});
        } else if (key === "lock") {
          chan.lock = val;
          await chans.update({ _id: chan._id }, chan);
          send([ctx.socket.id], `Channel %ch${chan.name}%cn updated.`, {});
        } else {
          send([ctx.socket.id], `Invalid setting ${key}.`, {});
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

        await dbojs.update({ _id: en._id }, en);
        send([ctx.socket.id], `You join channel ${chan.name}.`, {});
        ctx.socket.join(chan.name);
        await force(ctx, `${chan.alias} :joins the channel.`);
        send(
          [ctx.socket.id],
          `You have joined ${chan.name} with the alias '%ch${args[1]}%cn'.`,
          {}
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
          (c: IChanEntry) => c.alias !== args[0]
        );
        send([ctx.socket.id], `You leave channel ${c.channel}.`, {});
        await force(ctx, `${args[0]} :leaves the channel.`);
        ctx.socket.leave(c.channel);
        await dbojs.update({ _id: en._id }, en);
      });
    },
  });
};
