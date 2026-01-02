import { registerFunction } from "./registry.ts";
import { mail } from "../../../services/Database/index.ts";
import { target } from "../../../utils/target.ts";
import type { IDBOBJ } from "../../../@types/IDBObj.ts";

const getEnactor = (data: Record<string, unknown>): IDBOBJ | undefined => {
  return data.enactor as IDBOBJ;
};

registerFunction("mail", async (args, data) => {
    // mail([player], [folder])
    const enactor = getEnactor(data);
    if (!enactor) return "#-1 NO ENACTOR";
    
    let player = enactor;
    if (args[0]) {
        const t = await target(enactor, args[0], true);
        if (t) player = t;
    }
    
    // Check permissions? Usually you can only check your own mail or if wizard.
    // For now, allow checking own mail.
    if (player.id !== enactor.id && !enactor.flags.includes("wizard")) {
        return "#-1 PERMISSION DENIED";
    }
    
    // Count mail
    // Folders not fully implemented in DB, assuming folder 0 (inbox) for all?
    // Current mail command doesn't store folder.
    // We count all messages to this player.
    const mails = await mail.query({ to: { $in: ["#" + player.id] } });
    
    // Filter by folder if implemented?
    // Filter by read/unread?
    // MUX mail() returns:
    // mail() -> number of read/unread/cleared? 
    // Actually mail() with no args returns number of messages.
    // mail(player) -> number of messages for player.
    
    return mails.length.toString();
});

registerFunction("mailfrom", async (args, data) => {
    // mailfrom(player, msgNum)
    const enactor = getEnactor(data);
    if (!enactor) return "#-1 NO ENACTOR";
    
    let player = enactor;
    let numIdx = 0;
    
    if (args.length > 1) {
        const t = await target(enactor, args[0], true);
        if (t) {
            player = t;
            numIdx = 1;
        }
    }
    
    if (player.id !== enactor.id && !enactor.flags.includes("wizard")) {
        return "#-1 PERMISSION DENIED";
    }

    const mails = (await mail.query({ to: { $in: ["#" + player.id] } })).sort((a, b) => a.date - b.date);
    const num = parseInt(args[numIdx] || "0");
    
    if (num < 1 || num > mails.length) return "#-1 INVALID MESSAGE NUMBER";
    
    return mails[num - 1].from;
});
