import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { getAttribute } from "../utils/getAttribute.ts";
import { sandboxService } from "../services/Sandbox/SandboxService.ts";
import { splitArgs } from "../utils/splitArgs.ts";
import { send } from "../services/broadcast/index.ts";
import { target } from "../utils/target.ts";
import { queue } from "../services/Queue/index.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";

export default () => {
    addCmd({
        name: "@trigger",
        pattern: /^@tr(?:igger)?\s+([^/]+)\/([^=]+)(?:=(.*))?$/i,
        lock: "connected",
        exec: async (ctx, args) => {
            const en = await dbojs.queryOne({ id: ctx.socket.cid! });
            if (!en) return;
            
            const tarName = args[0];
            const attrName = args[1].toUpperCase();
            const triggerArgsRaw = args[2] || "";
            
            const tar = await target(en as unknown as IDBOBJ, tarName);
            if (!tar) return send([ctx.socket.id], "I can't find that here!", {});
            
            const attr = await getAttribute(tar, attrName);
            if (!attr) return send([ctx.socket.id], `Attribute ${attrName} not found on ${tarName}.`, {});
            
            const evalArgs = splitArgs(triggerArgsRaw).map(a => a.trim());
            
            // Execute via Script Engine
            await sandboxService.runScript(attr.value, {
                id: tar.id,
                location: tar.location || "limbo",
                state: (tar as any).data?.state || {},
                target: evalArgs[0] ? { id: evalArgs[0] } : undefined
            });

            send([ctx.socket.id], `Triggered script on ${tarName}/${attrName}.`, {});
        }
    });

    addCmd({
        name: "@wait",
        pattern: /^@wait\s+(\d+)\s*=\s*(.*)/i,
        lock: "connected",
        exec: (ctx, args) => {
            const seconds = parseInt(args[0]);
            const cmd = args[1];
            
            if (isNaN(seconds) || seconds < 0) return send([ctx.socket.id], "Invalid time.", {});
            
            // Queue the command
            queue.enqueue({
                command: cmd,
                executor: ctx.socket.cid || "#-1",
                enactor: ctx.socket.cid || "#-1",
                data: ctx.data || {}
            }, seconds * 1000).then((pid) => {
                 send([ctx.socket.id], `Wait ${seconds}s: ${cmd} (PID: ${pid})`, {});
            });
        }
    });
};
