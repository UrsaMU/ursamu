
/**
 * System Script: mailadd.ts
 * 
 * Handles appending text to the current mail draft.
 * Triggered by prefixes '-' (add line) and '~' (add line with space?)
 * 
 * Invoked with args: [message]
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
  state: Record<string, unknown>;
}

interface IUrsamuSDK {
    me: IDBObj;
    cmd: { args: string[] };
    db: {
        modify(id: string, op: string, data: unknown): Promise<void>;
    };
    send(message: string): void;
    force(command: string): void;
}

export default async (u: IUrsamuSDK) => {
    const en = u.me;
    en.state ||= {};
    
    if (!en.state.tempMail) {
        u.send("%chMAIL:%cn No message started.");
        return;
    }
    
    // The prefix handling in cmdParser passes the rest of the line as arg.
    // If invoked via `-`, it's a new line.
    // If invoked via `~`, it's a continuation?
    // MUX usually: `-` appends text + newline? Or just text?
    // If I type `-foo`, it appends "foo".
    // If I type `~foo`, it appends " foo" (no, wait).
    // The original `mail.ts` had `mailadd` taking `marker` and `message`.
    // The `cmdParser` will just pass the content.
    // We need to know which prefix was used to decide logic.
    // But `u.cmd.name` will be `mailadd` for both if mapped.
    // I can map `-` to `mailadd` and `~` to `mailappend`?
    // Or I can just check if the message starts with something?
    // No, prefixes are stripped.
    
    // Let's assume standard MUX mail behavior:
    // `-` adds text as is.
    // `~` adds text.
    // The distinction is usually trivial or legacy.
    // Original code:
    /*
    415:   if (marker === "~") {
    416:     tempMail.message +=
    417:       message + " " + tempMail.message; // Prepend? No.
    // Wait, 417: message + " " + tempMail.message;
    // That prepended content? That seems weird.
    // Maybe `~` was `prepend`?
    */
    
    // Standard MUX: `-` is enter message mode.
    // But if already in message, it just adds to buffer?
    // In `mail.ts`, `mailadd` was:
    // 418:   } else if (marker === "-" && message === "-") {
    // 419:     return force({ socket }, "@mail/send");
    // 420:   } else {
    // 421:     tempMail.message += message + " ";
    // 422:   }
    
    // So `-` with `-` triggers send.
    // `-` with text appends text + space.
    // `~` logic was weird in original code.
    
    // I will simplify:
    // Both append text + space (or newline).
    // If message is `-`, trigger send.
    
    const message = u.cmd.args[0] || "";
    const mail = en.state.tempMail as IMail;

    if (message === "-") {
        u.force("mail/send");
        return;
    }
    
    mail.message += message + "\n";
    await u.db.modify(en.id, "$set", { data: en.state });
    u.send("%chMAIL:%cn Message updated.");
};
