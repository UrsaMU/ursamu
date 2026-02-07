
/**
 * System Script: mail.ts
 * 
 * Handles @mail command and its subcommands.
 * Redesigned for minimalist aesthetics and command-driven usage.
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
    cmd: { name: string, args: string[] };
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
    };
    send(message: string | string[], target?: string): void;
    force(command: string): void;
}

// Formatting Helpers
const HR = "%cr" + "-".repeat(70) + "%cn";
const PAD = (text: string, width: number) => text.padEnd(width).slice(0, width);
const DATE = (timestamp: number) => new Date(timestamp).toLocaleDateString() + " " + new Date(timestamp).toLocaleTimeString();

export default async (u: IUrsamuSDK) => {
    const args = u.cmd.args;
    const rawinput = args[0] || ""; // Full raw args string
    const en = u.me;
    en.state ||= {};

    // 1. Parse Command
    // Syntax: mail <subcmd> <args> OR mail <target> <subject> = <message> OR mail <# (read)> OR mail <target (draft)>
    
    // Check for "One-liner" Compose: mail <target> <subject> = <message>
    if (rawinput.includes("=") && !u.cmd.name.includes("/")) {
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

    // Determine Action
    let subCmd = "";
    if (u.cmd.name.includes("/")) {
        subCmd = u.cmd.name.split("/")[1].toLowerCase();
    } else {
        const firstArg = (args[1] || "").toLowerCase(); // args[0] is raw, args[1] is first token? No.
        // u.cmd.args passed from parser: [rawArgs, ...splitArgs]
        // So args[1] is the first word.
        if (args[1]) {
             if (["send", "read", "delete", "quick", "proof", "edit", "abort", "cc", "bcc", "reply", "notify", "replyall", "forward", "subject"].includes(firstArg)) {
                 subCmd = firstArg;
             } else {
                 // Smart Parsing: Number => Read, Name => Draft
                 if (!isNaN(parseInt(firstArg))) {
                     subCmd = "read";
                 } else {
                     subCmd = "draft";
                 }
             }
        } else {
            subCmd = "list";
        }
    }

    // Execute Action
    switch(subCmd) {
        case "list": {
            const mails = await u.mail.read({ to: { $in: [`#${en.id}`] } });
            mails.sort((a, b) => a.date - b.date);
            
            const unreadCount = mails.filter(m => !m.read).length;
            u.send(`\n%chMAILBOX:%cn ${mails.length} message${mails.length===1?'':'s'} (${unreadCount} new)\n`);
            u.send(`%ch${PAD("ID", 5)} ${PAD("From", 20)} ${PAD("Subject", 30)} ${PAD("Date", 15)}%cn`);
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
            const num = parseInt(args[1] === "read" ? args[2] : args[1]); // Handle 'mail read 1' vs 'mail 1'
            const mails = await u.mail.read({ to: { $in: [`#${en.id}`] } });
            mails.sort((a, b) => a.date - b.date);
            
            if (!num || num < 1 || num > mails.length) {
                 u.send("%chMAIL:%cn Invalid message number.");
                 return;
            }
            
            const m = mails[num - 1];
            m.read = true;
            await u.mail.send(m);
            
            const fromId = m.from.replace("#", "");
            const fromObj = await u.util.target(en, fromId).catch(() => null);
            const fromName = fromObj?.name || "Unknown";
            
            u.send(`\nMessage: ${num}`);
            u.send(`From:    ${fromName} (#${fromId})`);
            u.send(`To:      ${(m.to || []).join(", ")}`);
            u.send(`Subject: ${m.subject}`);
            u.send(`Date:    ${DATE(m.date)}`);
            u.send(HR);
            u.send("");
            u.send(m.message);
            u.send("");
            break;
        }

        case "draft": {
            // mail <name> [subject] (optional subject inline? Plan said 'mail <target>' starts draft)
            const targetName = args[1];
             const target = await u.util.target(en, targetName);
            if (!target) return u.send(`%chMAIL:%cn Target '${targetName}' not found.`);

            if (en.state.tempMail) {
                u.send(`%chMAIL:%cn You already have a draft in progress. Use 'mail abort' to discard it.`);
                return;
            }

            en.state.tempMail = {
                id: crypto.randomUUID(),
                from: `#${en.id}`,
                to: [`#${target.id}`],
                subject: "(No Subject)",
                message: "",
                date: Date.now(),
                read: false
            };
            
            await u.db.modify(en.id, "$set", { data: en.state });
            u.send(`Draft started to %ch${target.name}%cn.`);
            u.send(`use 'mail subject <text>' to set the subject.`);
            u.send(`use '-<line>' to add text to the body.`);
            u.send(`use 'mail send' to send.`);
            break;
        }

        case "subject": {
            if (!en.state.tempMail) return u.send("%chMAIL:%cn No draft in progress.");
            const subject = args.slice(2).join(" "); // mail subject <text>
            const draft = en.state.tempMail as IMail;
            draft.subject = subject;
            await u.db.modify(en.id, "$set", { data: en.state });
            u.send(`Subject set: ${subject}`);
            break;
        }

        case "send": {
            if (!en.state.tempMail) return u.send("%chMAIL:%cn No draft in progress.");
            const draft = en.state.tempMail as IMail;
            
            if (!draft.message && !draft.subject) {
                 return u.send("%chMAIL:%cn Cannot send empty message.");
            }
            
            await u.mail.send(draft);
            u.send("%chMAIL:%cn Message sent.");
            for(const tId of draft.to) {
                 const id = tId.replace("#", "");
                 u.send(`%chMAIL:%cn You have a new message from ${en.name || "Unknown"}`, id);
            }
            delete en.state.tempMail;
            await u.db.modify(en.id, "$set", { data: en.state });
            break;
        }
        
        case "proof": {
             if (!en.state.tempMail) return u.send("%chMAIL:%cn No draft in progress.");
             const m = en.state.tempMail as IMail;
             
             u.send(`\n%chDRAFT PREVIEW%cn`);
             u.send(`From:    ${en.name} (#${en.id})`);
             u.send(`To:      ${m.to.join(", ")}`);
             u.send(`Subject: ${m.subject}`);
             u.send(HR);
             u.send(m.message || "(No Body)");
             u.send("");
             break;
        }
        
        case "abort": {
            if (!en.state.tempMail) return u.send("%chMAIL:%cn No draft in progress.");
            delete en.state.tempMail;
            await u.db.modify(en.id, "$set", { data: en.state });
            u.send("%chMAIL:%cn Draft discarded.");
            break;
        }

        case "delete": {
            const num = parseInt(args[1] === "delete" ? args[2] : args[1]);
            const mails = await u.mail.read({ to: { $in: [`#${en.id}`] } });
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

export const aliases = ["mail/send", "mail/read", "mail/delete", "mail/quick", "mail/proof", "mail/edit", "mail/abort", "mail/cc", "mail/bcc", "mail/reply", "mail/notify", "mail/replyall", "mail/forward", "mail/subject"];