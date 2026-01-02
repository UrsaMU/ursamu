import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { sign } from "../services/jwt/index.ts";
import { target } from "../utils/target.ts";
import { canEdit } from "../utils/canEdit.ts";

export default () => {
    addCmd({
        name: "@edit",
        pattern: /^@edit\s+(.*)/i,
        lock: "connected",
        help: "Edit an attribute on the web",
        category: "developer",
        exec: async (ctx, args) => {
            const [raw] = args;
            if (!ctx.socket.cid) return;
            const en = await dbojs.queryOne({ id: ctx.socket.cid });
            if (!en) return;

            const parts = raw.split("/");
            let targetName = "";
            let attrName = "";

            if (parts.length === 1) {
                targetName = raw;
                // If only object given, maybe link to general edit?
                // For now, let's enforce object/attribute
                return send([ctx.socket.id], "Usage: @edit <object>/<attribute>", {});
            } else {
                targetName = parts[0];
                attrName = parts.slice(1).join("/");
            }
            
            const obj = await target(en, targetName, true);
            if (!obj) {
                return send([ctx.socket.id], `Could not find ${targetName}.`, {});
            }

            if (!await canEdit(en, obj)) {
                 return send([ctx.socket.id], "Permission denied.", {});
            }

            // Generate Token
            const token = await sign({ 
                id: en.id,
                scope: "edit",
                target: obj.id,
                attr: attrName,
                exp: Date.now() + (1000 * 60 * 15) // 15 mins
            });

            const url = `http://localhost:8000/edit?token=${token}&dbref=${obj.id}&attr=${attrName}`;
            
            send([ctx.socket.id], `Edit Link (expires in 15m): %ch%cb${url}%cn`, {});
        }
    });
};
