import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  mailList, mailRead, mailTrash, mailRestore, mailPurge,
  mailSave, mailUnsave,
} from "./mailInboxActions.ts";
import {
  mailDraftNew, mailAppend, mailSubject, mailCC, mailBCC,
  mailAttach, mailProof, mailAbort, mailSend, mailReply, mailForward,
} from "./mailComposeActions.ts";
import { mailDb } from "./mailDbo.ts";

addCmd({
  name: "@mail",
  pattern: /^@?mail(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Communication",
  help: `@mail[/<switch>] [<args>]  — In-game mail system.

Composing:
  @mail <player>=<subject>    Start a draft to <player> with <subject>.
  -<text>                     Append a line to your active draft.
  @mail/subject <text>        Set the subject of your draft.
  @mail/cc <player>           Add a CC recipient to your draft.
  @mail/bcc <player>          Add a BCC recipient to your draft.
  @mail/attach <object>       Attach a game object dbref to your draft.
  @mail/proof                 Preview your draft before sending.
  @mail/send                  Send the current draft.
  @mail/abort                 Discard the current draft.

Reading:
  @mail                       List your inbox.
  @mail <number>              Read message #<number>.
  @mail/trash                 List your trash folder.
  @mail/read <number>         Read a message (explicit form).

Managing:
  @mail/reply <number>        Reply to a message.
  @mail/replyall <number>     Reply to all recipients.
  @mail/forward <num>=<target>  Forward a message to <target>.
  @mail/save <number>         Protect a message from deletion.
  @mail/unsave <number>       Remove deletion protection.
  @mail/delete <number>       Move a message to trash.
  @mail/restore <number>      Restore a trashed message to inbox.
  @mail/purge                 Permanently delete all trashed messages.

Examples:
  @mail Alice=Hello           Start a draft to Alice with subject "Hello".
  -This is the message body.  Add a line to your draft.
  @mail/send                  Send the draft.
  @mail 3                     Read message #3.
  @mail/reply 3               Reply to message #3.`,

  exec: (u: IUrsamuSDK) => {
    const sw      = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const subArgs = (u.cmd.args[1] ?? "").trim();

    // @mail <number> — read shorthand
    if (!sw && /^\d+$/.test(subArgs)) return mailRead(u, subArgs);

    // @mail <target>=<subject> — start draft
    if (!sw && subArgs.includes("=")) return mailDraftNew(u, subArgs);

    switch (sw) {
      case "":
      case "list":    return mailList(u, "inbox");
      case "trash":   return subArgs ? mailTrash(u, subArgs) : mailList(u, "trash");
      case "read":    return mailRead(u, subArgs);
      case "reply":   return mailReply(u, subArgs, false);
      case "replyall":return mailReply(u, subArgs, true);
      case "forward": return mailForward(u, subArgs);
      case "subject": return mailSubject(u, subArgs);
      case "cc":      return mailCC(u, subArgs);
      case "bcc":     return mailBCC(u, subArgs);
      case "attach":  return mailAttach(u, subArgs);
      case "proof":   return mailProof(u);
      case "send":    return mailSend(u);
      case "abort":   return mailAbort(u);
      case "save":    return mailSave(u, subArgs);
      case "unsave":  return mailUnsave(u, subArgs);
      case "delete":  return mailTrash(u, subArgs);
      case "restore": return mailRestore(u, subArgs);
      case "purge":   return mailPurge(u);
      default:
        u.send(`%chMAIL:%cn Unknown switch '${sw}'. Type 'help @mail' for usage.`);
    }
  },
});

addCmd({
  name: "-",
  pattern: /^-(.+)/,
  lock: "connected",
  category: "Communication",
  help: `-<text>  — Append a line to your active mail draft.

Examples:
  -This is the first line.    Add a line to the current draft.
  -Another line of the body.  Add another line.`,
  exec: (u: IUrsamuSDK) => mailAppend(u, u.cmd.args[0] ?? ""),
});

addCmd({
  name: "@mailstat",
  pattern: /^@mailstat$/i,
  lock: "connected admin+",
  category: "Admin",
  help: `@mailstat  — Display mail system statistics (admin only).

Examples:
  @mailstat    Show total messages, unread count, and trash count.`,
  exec: async (u: IUrsamuSDK) => {
    const all   = await mailDb.find({});
    const inbox = all.filter(m => (m.folder ?? "inbox") === "inbox");
    const trash = all.filter(m => m.folder === "trash");
    const unread = inbox.filter(m => !m.read);
    u.send(`%ch--- Mail System Statistics ---%cn`);
    u.send(`Total messages : ${all.length}`);
    u.send(`Inbox          : ${inbox.length} (${unread.length} unread)`);
    u.send(`Trash          : ${trash.length}`);
    u.send(`%ch------------------------------%cn`);
  },
});
