import { addCmd } from "../services/commands/index.ts";
import { mailer, comp, mailadd } from "../../system/scripts/mail.ts";

addCmd({
  name: "@mail",
  pattern: /[@/+]?mail\s+(.*)\s*=\s*(.*)/,
  lock: "connected",
  hidden: true,
  exec: async (ctx, args) => {
    await comp(ctx.socket, args);
  },
});

addCmd({
  name: "-",
  pattern: /^(-|~)(.*)/,
  lock: "connected",
  hidden: true,
  exec: async (ctx, args) => {
    await mailadd(ctx.socket, args);
  },
});

addCmd({
  name: "@mail/send",
  pattern: /^(?:[@+]?mail\/send|--)/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx) => {
    await mailer(ctx.socket, ["send"]);
  },
});

addCmd({
  name: "@mail/quick",
  pattern: /^[@/+]?mail\/quick\s+(.*)/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx, args) => {
    await mailer(ctx.socket, ["quick", ...args]);
  },
});

addCmd({
  name: "@mail/proof",
  pattern: /^[@/+]?mail\/proof/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx) => {
    await mailer(ctx.socket, ["proof"]);
  },
});

addCmd({
  name: "@mail/edit",
  pattern: /^[@/+]?mail\/edit\s+(.*)\s*=\s*(.*)/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx, args) => {
    await mailer(ctx.socket, ["edit", ...args]);
  },
});

addCmd({
  name: "@mail/abort",
  pattern: /^[@/+]?mail\/abort/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx) => {
    await mailer(ctx.socket, ["abort"]);
  },
});

addCmd({
  name: "@mail/cc",
  pattern: /^[@/+]?mail\/cc\s+(.*)/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx, args) => {
    await mailer(ctx.socket, ["cc", ...args]);
  },
});

addCmd({
  name: "@mail/bcc",
  pattern: /^[@/+]?mail\/bcc\s+(.*)/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx, args) => {
    await mailer(ctx.socket, ["bcc", ...args]);
  },
});

addCmd({
  name: "@mail/read2",
  pattern: /^[@/+]?mail\s+(.*)/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx, args) => {
    await mailer(ctx.socket, ["read", ...args]);
  },
});

addCmd({
  name: "@mail",
  pattern: /^[@/+]?mail$/i,
  lock: "connected",
  exec: async (ctx) => {
    await mailer(ctx.socket, []);
  },
});

addCmd({
  name: "@mail/read",
  pattern: /^[@/+]?mail\/read\s+(.*)/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx, args) => {
    await mailer(ctx.socket, ["read", ...args]);
  },
});

addCmd({
  name: "@mail/delete",
  pattern: /^[@/+]?mail\/delete\s+(.*)/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx, args) => {
    await mailer(ctx.socket, ["delete", ...args]);
  },
});

addCmd({
  name: "@mail/reply",
  pattern: /^[@/+]?mail\/reply\s+(.*)/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx, args) => {
    await mailer(ctx.socket, ["reply", ...args]);
  },
});

addCmd({
  name: "@mail/notify",
  pattern: /^[@/+]?mail\/notify/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx) => {
    await mailer(ctx.socket, ["notify"]);
  },
});

addCmd({
  name: "@mail/replyall",
  pattern: /^[@/+]?mail\/replyall\s+(.*)/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx, args) => {
    await mailer(ctx.socket, ["replyall", ...args]);
  },
});

addCmd({
  name: "@mail/forward",
  pattern: /^[@/+]?mail\/forward\s+(.*)\s*=\s*(.*)/i,
  lock: "connected",
  hidden: true,
  exec: async (ctx, args) => {
    await mailer(ctx.socket, ["forward", ...args]);
  },
});