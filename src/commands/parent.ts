import { send } from "../services/broadcast/index.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { displayName } from "../utils/displayName.ts";
import { target } from "../utils/target.ts";
import { canEdit } from "../utils/canEdit.ts";

export default () => {
    addCmd({
        name: "@parent",
        pattern: /^[@/+]?parent\s+(.*)\s*=\s*(.*)/i,
        lock: "connected builder+",
        help: "Set an object's parent",
        category: "building",
        exec: async (ctx, args) => {
            if (!ctx.socket.cid) return;
            const en = await dbojs.queryOne({ id: ctx.socket.cid });
            if (!en) return;
            const [thing, parent] = args;
            
            const thingObj = await target(en, thing, true);
            if (!thingObj) {
                return send([ctx.socket.id], `Could not find base object %ch${thing}%cn.`, {});
            }

            if (!await canEdit(en, thingObj)) {
                return send([ctx.socket.id], "You can't modify that.", {});
            }

            const parentObj = await target(en, parent, true);
            if (!parentObj) {
                return send([ctx.socket.id], `Could not find parent object %ch${parent}%cn.`, {});
            }

            // MUX @parent stores the parent dbref in data.parent (usually) or a specific field.
            // Let's assume data.parent for now.

            // Cycle detection
             let current: IDBOBJ | null | undefined = parentObj;
             let depth = 0;
             while (current && depth < 50) {
                 if (current.id === thingObj.id) {
                     return send([ctx.socket.id], "You can't be your own grandfather!", {});
                 }
                 if (current.data?.parent) {
                     current = (await dbojs.queryOne({ id: current.data.parent as string })) || null;
                 } else {
                     current = null;
                 }
                 depth++;
             }

            thingObj.data ||= {};
            thingObj.data.parent = parentObj.id;
            
            await dbojs.modify({ id: thingObj.id }, "$set", thingObj);
            
            send([ctx.socket.id], `Parent changed for ${displayName(en, thingObj, true)}.`, {});
        }
    })
};
