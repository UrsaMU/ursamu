import { Obj } from "../services/DBObjs";
import { dbojs, mail } from "../services/Database";
import { send } from "../services/broadcast";
import { addCmd, force } from "../services/commands";
import { center } from "../utils/format";
import { target } from "../utils/target";

export default () => {
  addCmd({
    name: "@mail",
    pattern: /[@/+]?mail\s+(.*)\s*=\s*(.*)/,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const [targets, subject] = args;
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      const tars = [];
      for (const tar of targets.split(",")) {
        const t = await target(en, tar.trim());
        if (t) {
          tars.push(t);
        }
      }

      en.dbobj.data ||= {};
      const ids = tars.map((t) => `#${t.id}`) as string[];
      if (en.dbobj.data.tempMail)
        return send(
          [ctx.socket.id],
          "You already have a message started. Use @mail/send to send it."
        );

      en.dbobj.data.tempMail = {
        from: `#${en.id}`,
        to: ids,
        subject,
        message: "",
        date: Date.now(),
      };

      await dbojs.update({ id: en.id }, en.dbobj);
      await send(
        [ctx.socket.id],
        "Enter your message with '-<text>'. Use @mail/send to send it."
      );
    },
  });

  addCmd({
    name: "-",
    pattern: /^(-|~)(.*)/,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const [marker, message] = args;
      const en = await Obj.get(ctx.socket.cid);

      if (!en) return;
      en.dbobj.data ||= {};
      if (!en.dbobj.data.tempMail)
        return send([ctx.socket.id], "%chMAIL:%cn No message started.");

      if (marker === "~") {
        en.dbobj.data.tempMail.message +=
          message + " " + en.dbobj.data.tempMail.message;
      } else if (marker === "-" && message === "-") {
        return force(ctx, "@mail/send");
      } else {
        en.dbobj.data.tempMail.message += message + " ";
      }

      await dbojs.update({ id: en.id }, en.dbobj);
      send([ctx.socket.id], "%chMAIL:%cn Message updated.");
    },
  });

  addCmd({
    name: "@mail/send",
    pattern: /^(?:[@+]?mail\/send|--)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      en.dbobj.data ||= {};
      if (!en.dbobj.data.tempMail)
        return send([ctx.socket.id], "%chMAIL:%cn No message started.");

      const message = en.dbobj.data.tempMail;
      if (!message.message)
        return send(
          [ctx.socket.id],
          "%chMAIL:%cn No message entered. Use '-' to enter a message."
        );
      await mail.insert(message);
      send([ctx.socket.id], "%chMAIL:%cn Message sent.");
      send(
        en.dbobj.data.tempMail.to,
        `%chMAIL:%cn You have a new message from ${en.name}`
      );
      delete en.dbobj.data.tempMail;
      await dbojs.update({ id: en.id }, en.dbobj);
    },
  });

  addCmd({
    name: "@mail/quick",
    pattern: /^[@/+]?mail\/quick\s+(.*)\/(.*)\s*=\s*(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const [targets, subject, message] = args;
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      const tars = [];
      for (const tar of targets.split(",")) {
        const t = await target(en.dbobj, tar.trim());
        if (t) {
          tars.push(t);
        }
      }

      if (en) {
        const ids = tars.map((t) => `#${t.id}`);
        const ml = {
          from: en.dbref,
          to: ids,
          subject,
          message,
          read: false,
          date: Date.now(),
        };

        await mail.insert(ml);
        send([ctx.socket.id], "%chMAIL:%cn Message sent.");
        send(ids, `%chMAIL:%cn You have a new message from ${en.name}`);
      }
    },
  });

  addCmd({
    name: "@mail/proof",
    pattern: /^[@/+]?mail\/proof/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      en.dbobj.data ||= {};
      if (!en.dbobj.data.tempMail)
        return send([ctx.socket.id], "%chMAIL:%cn No message started.");

      let names: string[] = [];
      for (const id of en.dbobj.data.tempMail.to) {
        const p = await Obj.get(id);
        if (p) {
          names.push(p.name || "");
        }
      }

      let cc: string[] = [];
      en.dbobj.data.tempMail.cc ||= [];
      if (en.dbobj.data.tempMail.cc.length > 0) {
        for (const id of en.dbobj.data.tempMail.cc) {
          const p = await Obj.get(id);
          if (p) {
            cc.push(p.name || "");
          }
        }
      }

      let bcc: string[] = [];
      en.dbobj.data.tempMail.bcc ||= [];
      if (en.dbobj.data.tempMail?.bcc?.length > 0) {
        for (const id of en.dbobj.data.tempMail.bcc) {
          const p = await Obj.get(id);
          if (p) {
            cc.push(p.name || "");
          }
        }
      }

      let output = "-".repeat(78) + "\n";
      output += `From: ${en.name?.padEnd(
        20
      )} Subject: ${en.dbobj.data.tempMail.subject.slice(0, 60)}\n`;
      output += `To: ${names.join(", ")}\n`;
      if (cc.length) output += `CC: ${cc.join(", ")}\n`;
      if (bcc.length) output += `BCC: ${bcc.join(", ")}\n`;
      output += "-".repeat(78) + "\n";
      output += en.dbobj.data.tempMail.message.trim() + "\n";
      output += "-".repeat(78);
      send([ctx.socket.id], output);
    },
  });

  addCmd({
    name: "@mail/edit",
    pattern: /^[@/+]?mail\/edit\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const [before, after] = args.slice(1);
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      en.dbobj.data ||= {};
      if (!en.dbobj.data.tempMail)
        return send([ctx.socket.id], "%chMAIL:%cn No message started.");

      en.dbobj.data.tempMail.message = en.dbobj.data.tempMail.message.replace(
        before,
        after
      );

      await dbojs.update({ id: en.id }, en.dbobj);
      send([ctx.socket.id], "%chMAIL:%cn Message updated.");
    },
  });

  addCmd({
    name: "@mail/abort",
    pattern: /^[@/+]?mail\/abort/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      en.dbobj.data ||= {};
      if (!en.dbobj.data.tempMail)
        return send([ctx.socket.id], "%chMAIL:%cn No message started.");

      delete en.dbobj.data.tempMail;
      await dbojs.update({ id: en.id }, en.dbobj);
      send([ctx.socket.id], "%chMAIL:%cn Message aborted.");
    },
  });

  addCmd({
    name: "@mail/cc",
    pattern: /^[@/+]?mail\/cc\s+(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const targets = args[1];
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      en.dbobj.data ||= {};
      if (!en.dbobj.data.tempMail)
        return send([ctx.socket.id], "%chMAIL:%cn No message started.");

      en.dbobj.data.tempMail.cc ||= [];
      for (const tar of targets.split(",")) {
        const t = await target(en, tar.trim());
        if (!t) continue;
        if (`#${t.id}`) en.dbobj.data.tempMail.cc.push(`#${t.id}`);
      }

      await dbojs.update({ id: en.id }, en.dbobj);
      send([ctx.socket.id], "%chMAIL:%cn CC updated.");
    },
  });

  addCmd({
    name: "@mail/bcc",
    pattern: /^[@/+]?mail\/bcc\s+(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const targets = args[1];
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      en.dbobj.data ||= {};
      if (!en.dbobj.data.tempMail)
        return send([ctx.socket.id], "%chMAIL:%cn No message started.");

      en.dbobj.data.tempMail.bcc ||= [];
      for (const tar of targets.split(",")) {
        const t = await target(en, tar);
        if (!t) continue;
        if (`#${t.id}`) en.dbobj.data.tempMail.bcc.push(`#${t.id}`);
      }

      await dbojs.update({ id: en.id }, en.dbobj);
      send([ctx.socket.id], "%chMAIL:%cn BCC updated.");
    },
  });

  addCmd({
    name: "@mail/read2",
    pattern: /^[@/+]?mail\s+(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      const mails = (await mail.find({ to: { $in: [en.dbref] } })).sort(
        (a, b) => a.date - b.date
      );
      const num = +args[0];
      if (num > mails.length || num < 1)
        return send([ctx.socket.id], "%chMAIL:%cn Invalid message number.");
      const m = mails[num - 1];
      const from = await Obj.get(m.from);
      const to = await Promise.all(m.to.map((id) => Obj.get(id)));
      const cc = m.cc ? await Promise.all(m.cc.map((id) => Obj.get(id))) : "";
      const bcc = m.bcc
        ? await Promise.all(m.bcc.map((id) => Obj.get(id)))
        : "";
      let output = center(`%b%chMAIL: ${num}%cn%b`, 78, "=") + "\n";
      output += `From: ${from?.name
        ?.padEnd(15)
        .slice(0, 15)} Subject: ${m.subject.padEnd(45).slice(0, 45)}\n`;
      output += `To: ${to.map((t) => t?.name || "").join(", ")}\n`;
      if (cc) output += `CC: ${cc.map((t) => t?.name).join(", ")}\n`;
      if (bcc) output += `BCC: ${bcc.map((t) => t?.name).join(", ")}\n`;
      output += "-".repeat(78) + "\n";
      output += m.message + "\n";
      output += "=".repeat(78);
      send([ctx.socket.id], output);
      en.dbobj.data ||= {};
      en.dbobj.data.mailread ||= [];
      en.dbobj.data.mailread.push(m._id!);
      await dbojs.update({ id: en.id }, en.dbobj);
    },
  });

  addCmd({
    name: "@mail",
    pattern: /^[@/+]?mail$/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const targets = args[1];
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      const mails = (await mail.find({ to: { $in: [en.dbref] } })).sort(
        (a, b) => a.date - b.date
      );
      let output = center(`%b%chMAIL: ${mails.length}%cn%b`, 78, "=") + "\n";
      for (const m of mails) {
        const from = await Obj.get(m.from);
        const to = await Promise.all(m.to.map((id) => Obj.get(id)));
        const cc = m.cc ? await Promise.all(m.cc.map((id) => Obj.get(id))) : "";
        const bcc = m.bcc
          ? await Promise.all(m.bcc.map((id) => Obj.get(id)))
          : "";
        output += `${en.dbobj.data?.mailread?.includes(m._id!) ? " " : "U"} ${
          mails.indexOf(m) + 1
        } From: ${from?.name?.padEnd(15).slice(0, 15)} Subject: ${m.subject
          .padEnd(45)
          .slice(0, 45)}\n`;
      }
      output += "=".repeat(78);
      send([ctx.socket.id], output);
    },
  });

  addCmd({
    name: "@mail/read",
    pattern: /^[@/+]?mail\/read\s+(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      const mails = await mail.find({ to: { $in: [en.dbref] } });
      const num = parseInt(args[1]);
      if (num > mails.length || num < 1)
        return send([ctx.socket.id], "%chMAIL:%cn Invalid message number.");
      const m = mails[num - 1];
      const from = await Obj.get(m.from);
      const to = await Promise.all(m.to.map((id) => Obj.get(id)));
      const cc = m.cc ? await Promise.all(m.cc.map((id) => Obj.get(id))) : "";
      let output = center(`%b%chMAIL: ${num}%cn%b`, 78, "=") + "\n";
      output += `From: ${from?.name
        ?.padEnd(15)
        .slice(0, 25)} Subject: ${m.subject.padEnd(48).slice(0, 48)}\n`;
      output += `To: ${to
        .map((p) => p?.name)
        .join(", ")
        .padEnd(15)
        .slice(0, 15)}\n`;
      if (cc) output += `CC: ${cc.map((p) => p?.name).join(", ")}\n`;
      output += "-".repeat(78) + "\n";
      output += m.message + "\n";
      output += "=".repeat(78);
      send([ctx.socket.id], output);
      en.dbobj.data ||= {};
      en.dbobj.data.mailread ||= [];
      if (!en.dbobj.data.mailread.includes(m._id!)) {
        en.dbobj.data.mailread.push(m._id!);
        await dbojs.update({ id: en.id }, en.dbobj);
      }
    },
  });

  addCmd({
    name: "@mail/delete",
    pattern: /^[@/+]?mail\/delete\s+(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      const mails = await mail.find({ to: { $in: [en.dbref] } });
      const num = parseInt(args[0]);
      if (num > mails.length || num < 1)
        return send([ctx.socket.id], "%chMAIL:%cn Invalid message number.");
      const m = mails[num - 1];
      const readers = await dbojs.find({ "data.mailread": { $in: [m._id] } });
      if (readers.length)
        return send(
          [ctx.socket.id],
          "%chMAIL:%cn Message has been read, cannot delete."
        );

      await mail.remove({ _id: m._id });
      send([ctx.socket.id], "%chMAIL:%cn Message deleted.");
    },
  });

  addCmd({
    name: "@mail/reply",
    pattern: /^[@/+]?mail\/reply\s+(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      const mails = await mail.find({ to: { $in: [en.dbref] } });
      const num = parseInt(args[0]);
      if (num > mails.length || num < 1)
        return send([ctx.socket.id], "%chMAIL:%cn Invalid message number.");
      const m = mails[num - 1];
      const from = await Obj.get(m.from);
      en.dbobj.data ||= {};

      en.dbobj.data.tempMail = {
        to: [from?.dbref],
        subject: `Re: ${m.subject}`,
        message: "",
        from: en.dbref!,
        date: Date.now(),
      };

      await dbojs.update({ id: en.id }, en.dbobj);
      send([ctx.socket.id], "%chMAIL:%cn Reply started.");
    },
  });

  addCmd({
    name: "@mail/notify",
    pattern: /^[@/+]?mail\/notify/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      const mails = await mail.find({
        $or: [
          { to: { $in: [en.dbref] } },
          { cc: { $in: [en.dbref] } },
          { bcc: { $in: [en.dbref] } },
        ],
      });

      en.dbobj.data ||= {};
      en.dbobj.data.mailread ||= [];

      await send(
        [ctx.socket.id],
        `%chMAIL:%cn You have %ch${
          mails.filter((m) => !en.dbobj.data?.mailread?.includes(m._id!)).length
        }%cn new messages.`
      );
    },
  });

  addCmd({
    name: "@mail/replyall",
    pattern: /^[@/+]?mail\/replyall\s+(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      const mails = await mail.find({ to: { $in: [en.dbref] } });
      const num = parseInt(args[1]);
      if (num > mails.length || num < 1)
        return send([ctx.socket.id], "%chMAIL:%cn Invalid message number.");
      const m = mails[num - 1];
      const from = await Obj.get(m.from);
      const to = await Promise.all(m.to.map((id) => Obj.get(id)));
      const cc = m.cc ? await Promise.all(m.cc.map((id) => Obj.get(id))) : "";
      en.dbobj.data ||= {};

      en.dbobj.data.tempMail = {
        to: [from?.dbref!],
        subject: `Re: ${m.subject}`,
        message: "",
        from: en.dbref,
        date: Date.now(),
      };

      if (to) en.dbobj.data.tempMail.to.push(...to.map((p) => p?.dbref));
      if (cc) en.dbobj.data.tempMail.to.push(...cc.map((p) => p?.dbref));

      await dbojs.update({ id: en.id }, en.dbobj);
      send([ctx.socket.id], "%chMAIL:%cn Reply started.");
    },
  });

  addCmd({
    name: "@mail/forward",
    pattern: /^[@/+]?mail\/forward\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;
      const mails = await mail.find({ to: { $in: [en.dbref] } });
      const num = +args[0];
      if (num > mails.length || num < 1)
        return send([ctx.socket.id], "%chMAIL:%cn Invalid message number.");
      const m = mails[num - 1];

      en.dbobj.data ||= {};

      const to = await Obj.get(args[0]);
      if (!to) return send([ctx.socket.id], "%chMAIL:%cn Invalid recipient.");
      if (to.dbref) {
        en.dbobj.data.tempMail = {
          to: [to?.dbref],
          subject: `Fwd: ${m.subject}`,
          message: `---------- Forwarded message ----------\nFrom: ${m.from}\nSubject: ${m.subject}\n\n${m.message}\n----------- End Forward Message -----------\n`,
          from: en.dbref,
          date: Date.now(),
        };
      }

      await dbojs.update({ id: en.id }, en.dbobj);
      send([ctx.socket.id], "%chMAIL:%cn Forward started.");
    },
  });
};
