
/**
 * System Script: mail.ts
 *
 * Handles @mail command and its subcommands.
 */

interface IMail {
  id?: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  read: boolean;
  date: number;
}

interface IDBObj {
  id: string;
  name?: string;
  location?: string;
  flags: Set<string>;
  state: Record<string, unknown>;
  contents: IDBObj[];
  dbref?: string;
}

interface IUrsamuSDK {
    me: IDBObj;
    cmd: { name: string; args: string[]; switches?: string[] };
    util: {
        target(actor: IDBObj, query: string): Promise<IDBObj | undefined>;
    };
    db: {
        modify(id: string, op: string, data: unknown): Promise<void>;
    };
    mail: {
        send(mail: Partial<IMail>): Promise<void>;
        read(query: Record<string, unknown>): Promise<IMail[]>;
        delete(id: string): Promise<void>;
        modify(query: Record<string, unknown>, operator: string, update: Record<string, unknown>): Promise<void>;
    };
    send(message: string | string[], target?: string): void;
    force(command: string): void;
}

// Formatting Helpers
const HR = "%cr" + "-".repeat(70) + "%cn";
const PAD = (text: string, width: number) => text.padEnd(width).slice(0, width);
const DATE = (timestamp: number) => new Date(timestamp).toLocaleDateString() + " " + new Date(timestamp).toLocaleTimeString();

// Helper: get all mail where player is in TO or CC
async function getMyMail(u: IUrsamuSDK, playerId: string): Promise<IMail[]> {
    const dbref = `#${playerId}`;
    const toMails = await u.mail.read({ to: { $in: [dbref] } });
    const ccMails = await u.mail.read({ cc: { $in: [dbref] } });
    // Merge and deduplicate by id
    const seen = new Set<string>();
    const all: IMail[] = [];
    for (const m of [...toMails, ...ccMails]) {
        const key = m.id || `${m.from}-${m.date}`;
        if (!seen.has(key)) {
            seen.add(key);
            all.push(m);
        }
    }
    return all;
}

export default async (u: IUrsamuSDK) => {
    const args = u.cmd.args;
    const rawinput = args[0] || ""; // Full raw args string
    const en = u.me;
    en.state ||= {};

    // 1. Parse Command — switches come from u.cmd.switches (set by cmdParser)
    const switches = u.cmd.switches || [];

    // Check for "One-liner" Compose: mail <target> <subject> = <message>
    if (rawinput.includes("=") && switches.length === 0) {
        const [left, message] = rawinput.split("=");
        const parts = left.trim().split(" ");
        const targetName = parts[0];
        const subject = parts.slice(1).join(" ");

        const target = await u.util.target(en, targetName);
        if (!target) return u.send(`%chMAIL:%cn Target '${targetName}' not found.`);

        const newMail: Partial<IMail> = {
            id: crypto.randomUUID(),
            from: `#${en.id}`,
            to: [`#${target.id}`],
            subject: subject || "No Subject",
            message: message.trim(),
            date: Date.now(),
            read: false
        };

        await u.mail.send(newMail);
        u.send(`%chMAIL:%cn Message sent to ${target.name}.`);
        u.send(`%chMAIL:%cn You have a new message from ${en.name || "Unknown"}`, target.id);
        return;
    }

    // Determine subcommand from switches or positional args
    let subCmd = switches[0] || "";
    // After subcommand detection, subArgs holds remaining text for the handler
    let subArgs = rawinput;
    if (!subCmd) {
        const words = rawinput.split(/\s+/);
        const firstWord = (words[0] || "").toLowerCase();
        if (!rawinput.trim()) {
            subCmd = "list";
        } else if (["send", "read", "delete", "quick", "proof", "edit", "abort", "cc", "bcc", "reply", "notify", "replyall", "forward", "subject"].includes(firstWord)) {
            subCmd = firstWord;
            subArgs = words.slice(1).join(" ");
        } else if (!isNaN(parseInt(firstWord))) {
            subCmd = "read";
            subArgs = rawinput;
        } else {
            subCmd = "draft";
            subArgs = rawinput;
        }
    }

    // Execute Action
    switch(subCmd) {
        case "list": {
            const mails = await getMyMail(u, en.id);
            mails.sort((a, b) => a.date - b.date);

            const unreadCount = mails.filter(m => !m.read).length;
            u.send(`\n%chMAILBOX:%cn ${mails.length} message${mails.length===1?'':'s'} (${unreadCount} new)\n`);
            u.send(`%ch${PAD("#", 5)} ${PAD("From", 20)} ${PAD("Subject", 30)} ${PAD("Date", 15)}%cn`);
            u.send(HR);

            if (mails.length === 0) {
                u.send("  No messages.");
            } else {
                let i = 1;
                for (const m of mails) {
                    const fromId = m.from.replace("#", "");
                    const fromObj = await u.util.target(en, fromId).catch(() => null);
                    const fromName = fromObj?.name || "Unknown";

                    const idCol = m.read ? `%cn${i}` : `%ch%cw${i}%cn`;
                    u.send(`${PAD(idCol, 15)} ${PAD(fromName, 20)} ${PAD(m.subject, 30)} ${PAD(new Date(m.date).toLocaleDateString(), 15)}`);
                    i++;
                }
            }
            u.send("");
            break;
        }

        case "read": {
            const numStr = subArgs.trim();
            const num = parseInt(numStr || "");
            const mails = await getMyMail(u, en.id);
            mails.sort((a, b) => a.date - b.date);

            if (!num || num < 1 || num > mails.length) {
                u.send("%chMAIL:%cn Invalid message number.");
                return;
            }

            const m = mails[num - 1];
            if (m.id && !m.read) {
              try {
                await u.mail.modify({ id: m.id }, "$set", { read: true });
                m.read = true;
              } catch {
                // Fallback: mark read failed silently, mail is preserved
              }
            }

            const fromId = m.from.replace("#", "");
            const fromObj = await u.util.target(en, fromId).catch(() => null);
            const fromName = fromObj?.name || "Unknown";

            const toNames: string[] = [];
            for (const t of (m.to || [])) {
              const tid = t.replace("#", "");
              const tObj = await u.util.target(en, tid).catch(() => null);
              toNames.push(tObj?.name || t);
            }

            u.send(`\nMessage: ${num}`);
            u.send(`From:    ${fromName} (#${fromId})`);
            u.send(`To:      ${toNames.join(", ")}`);
            if (m.cc?.length) u.send(`CC:      ${m.cc.join(", ")}`);
            u.send(`Subject: ${m.subject}`);
            u.send(`Date:    ${DATE(m.date)}`);
            u.send(HR);
            u.send("");
            u.send(m.message);
            u.send("");
            break;
        }

        case "reply": {
            // @mail/reply <num> — starts a draft replying to message #num
            const num = parseInt(subArgs.trim() || "");
            const mails = await getMyMail(u, en.id);
            mails.sort((a, b) => a.date - b.date);

            if (!num || num < 1 || num > mails.length) {
                u.send("%chMAIL:%cn Usage: @mail/reply <message number>");
                return;
            }

            if (en.state.tempMail) {
                u.send("%chMAIL:%cn You already have a draft in progress. Use '@mail abort' to discard it.");
                return;
            }

            const orig = mails[num - 1];
            const draft = {
                id: crypto.randomUUID(),
                from: `#${en.id}`,
                to: [orig.from],
                subject: orig.subject.startsWith("Re: ") ? orig.subject : `Re: ${orig.subject}`,
                message: "",
                date: Date.now(),
                read: false
            };
            await u.db.modify(en.id, "$set", { "data.tempMail": draft });
            u.send(`%chMAIL:%cn Replying to "${orig.subject}". Use '-<text>' to add lines, 'mail send' to send.`);
            break;
        }

        case "replyall": {
            // @mail/replyall <num> — reply to sender + all original recipients
            const num = parseInt(subArgs.trim() || "");
            const mails = await getMyMail(u, en.id);
            mails.sort((a, b) => a.date - b.date);

            if (!num || num < 1 || num > mails.length) {
                u.send("%chMAIL:%cn Usage: @mail/replyall <message number>");
                return;
            }

            if (en.state.tempMail) {
                u.send("%chMAIL:%cn You already have a draft in progress. Use '@mail abort' to discard it.");
                return;
            }

            const orig = mails[num - 1];
            const allRecipients = [orig.from, ...orig.to.filter(id => id !== `#${en.id}`)];
            const unique = [...new Set(allRecipients)];

            const draft = {
                id: crypto.randomUUID(),
                from: `#${en.id}`,
                to: unique,
                subject: orig.subject.startsWith("Re: ") ? orig.subject : `Re: ${orig.subject}`,
                message: "",
                date: Date.now(),
                read: false
            };
            await u.db.modify(en.id, "$set", { "data.tempMail": draft });
            u.send(`%chMAIL:%cn Replying to all (${unique.length} recipients). Use '-<text>' to add lines.`);
            break;
        }

        case "forward": {
            // @mail/forward <num>=<target>
            const eqIdx = subArgs.indexOf("=");
            if (eqIdx === -1) {
                u.send("%chMAIL:%cn Usage: @mail/forward <message number>=<target>");
                return;
            }
            const num = parseInt(subArgs.slice(0, eqIdx));
            const targetName = subArgs.slice(eqIdx + 1).trim();

            const mails = await getMyMail(u, en.id);
            mails.sort((a, b) => a.date - b.date);

            if (!num || num < 1 || num > mails.length) {
                u.send("%chMAIL:%cn Invalid message number.");
                return;
            }

            const target = await u.util.target(en, targetName);
            if (!target) return u.send(`%chMAIL:%cn Target '${targetName}' not found.`);

            const orig = mails[num - 1];
            const forwarded: Partial<IMail> = {
                id: crypto.randomUUID(),
                from: `#${en.id}`,
                to: [`#${target.id}`],
                subject: orig.subject.startsWith("Fwd: ") ? orig.subject : `Fwd: ${orig.subject}`,
                message: `---------- Forwarded Message ----------\n${orig.message}`,
                date: Date.now(),
                read: false
            };
            await u.mail.send(forwarded);
            u.send(`%chMAIL:%cn Message forwarded to ${target.name}.`);
            u.send(`%chMAIL:%cn You have a forwarded message from ${en.name || "Unknown"}`, target.id);
            break;
        }

        case "cc": {
            // @mail/cc <target> — add cc to current draft
            if (!en.state.tempMail) return u.send("%chMAIL:%cn No draft in progress.");
            const targetName = subArgs.trim();
            if (!targetName) return u.send("%chMAIL:%cn Usage: @mail/cc <target>");
            const target = await u.util.target(en, targetName);
            if (!target) return u.send(`%chMAIL:%cn Target '${targetName}' not found.`);
            const draft = en.state.tempMail as IMail;
            draft.cc ||= [];
            const ccId = `#${target.id}`;
            if (!draft.cc.includes(ccId)) draft.cc.push(ccId);
            await u.db.modify(en.id, "$set", { "data.tempMail": draft });
            u.send(`%chMAIL:%cn Added ${target.name} to CC.`);
            break;
        }

        case "bcc": {
            // @mail/bcc <target> — add bcc to current draft
            if (!en.state.tempMail) return u.send("%chMAIL:%cn No draft in progress.");
            const targetName = subArgs.trim();
            if (!targetName) return u.send("%chMAIL:%cn Usage: @mail/bcc <target>");
            const target = await u.util.target(en, targetName);
            if (!target) return u.send(`%chMAIL:%cn Target '${targetName}' not found.`);
            const draft = en.state.tempMail as IMail;
            draft.bcc ||= [];
            const bccId = `#${target.id}`;
            if (!draft.bcc.includes(bccId)) draft.bcc.push(bccId);
            await u.db.modify(en.id, "$set", { "data.tempMail": draft });
            u.send(`%chMAIL:%cn Added ${target.name} to BCC.`);
            break;
        }

        case "draft": {
            const targetName = subArgs.trim();
            const target = await u.util.target(en, targetName);
            if (!target) return u.send(`%chMAIL:%cn Target '${targetName}' not found.`);

            if (en.state.tempMail) {
                u.send("%chMAIL:%cn You already have a draft in progress. Use '@mail abort' to discard it.");
                return;
            }

            const draft = {
                id: crypto.randomUUID(),
                from: `#${en.id}`,
                to: [`#${target.id}`],
                subject: "(No Subject)",
                message: "",
                date: Date.now(),
                read: false
            };

            await u.db.modify(en.id, "$set", { "data.tempMail": draft });
            u.send(`%chMAIL:%cn Draft started to %ch${target.name}%cn.`);
            u.send(`Use 'mail subject <text>' to set the subject.`);
            u.send(`Use '-<line>' to add text to the body.`);
            u.send(`Use 'mail send' to send, '@mail/cc <name>' to add CC recipients.`);
            break;
        }

        case "subject": {
            if (!en.state.tempMail) return u.send("%chMAIL:%cn No draft in progress.");
            const subject = subArgs.trim();
            const draft = en.state.tempMail as IMail;
            draft.subject = subject;
            await u.db.modify(en.id, "$set", { "data.tempMail": draft });
            u.send(`%chMAIL:%cn Subject set: ${subject}`);
            break;
        }

        case "send": {
            if (!en.state.tempMail) return u.send("%chMAIL:%cn No draft in progress.");
            const draft = en.state.tempMail as IMail;

            if (!draft.message && !draft.subject) {
                return u.send("%chMAIL:%cn Cannot send empty message.");
            }

            try {
                await u.mail.send(draft);
            } catch (e) {
                u.send(`%chMAIL:%cn Failed to send: ${e}`);
                return;
            }
            u.send("%chMAIL:%cn Message sent.");
            const allTo = [...draft.to, ...(draft.cc || []), ...(draft.bcc || [])];
            for (const tId of allTo) {
                const id = tId.replace("#", "");
                if (id !== en.id) {
                    u.send(`%chMAIL:%cn You have a new message from ${en.name || "Unknown"}`, id);
                }
            }
            await u.db.modify(en.id, "$unset", { "data.tempMail": 1 });
            break;
        }

        case "proof": {
            if (!en.state.tempMail) return u.send("%chMAIL:%cn No draft in progress.");
            const m = en.state.tempMail as IMail;

            u.send(`\n%chDRAFT PREVIEW%cn`);
            u.send(`From:    ${en.name} (#${en.id})`);
            u.send(`To:      ${m.to.join(", ")}`);
            if (m.cc?.length) u.send(`CC:      ${m.cc.join(", ")}`);
            if (m.bcc?.length) u.send(`BCC:     ${m.bcc.join(", ")}`);
            u.send(`Subject: ${m.subject}`);
            u.send(HR);
            u.send(m.message || "(No Body)");
            u.send("");
            break;
        }

        case "abort": {
            if (!en.state.tempMail) return u.send("%chMAIL:%cn No draft in progress.");
            await u.db.modify(en.id, "$unset", { "data.tempMail": 1 });
            u.send("%chMAIL:%cn Draft discarded.");
            break;
        }

        case "delete": {
            const numStr = subArgs.trim();
            const num = parseInt(numStr || "");
            const mails = await getMyMail(u, en.id);
            mails.sort((a, b) => a.date - b.date);

            if (!num || num < 1 || num > mails.length) {
                u.send("%chMAIL:%cn Invalid message number.");
                return;
            }

            const m = mails[num - 1];
            await u.mail.delete(m.id!);
            u.send("%chMAIL:%cn Message deleted.");
            break;
        }
    }
};

export const aliases = ["mail/send", "mail/read", "mail/delete", "mail/proof", "mail/abort", "mail/cc", "mail/bcc", "mail/reply", "mail/replyall", "mail/forward", "mail/subject"];
