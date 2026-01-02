import { addCmd, force } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { getAttribute } from "../utils/getAttribute.ts";
import { parser, splitArgs } from "../services/Softcode/parser.ts";
import { send } from "../services/broadcast/index.ts";
import { target } from "../utils/target.ts";
import { queue } from "../services/Queue/index.ts";

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
            
            const tar = await target(en, tarName);
            if (!tar) return send([ctx.socket.id], "I can't find that here!", {});
            
            const attr = await getAttribute(tar, attrName);
            if (!attr) return send([ctx.socket.id], `Attribute ${attrName} not found on ${tarName}.`, {});
            
            // Parse arguments
            // MUX @trigger args are literal or evaluated?
            // Usually evaluated before passing?
            // "The <command list> is then executed as if it were the objects @Startup attribute, with %0 becoming <arg1>, %1 becoming <arg2>, and so on."
            // But are the arguments evaluated in the caller's context?
            // "@tr obj/attr=1+2" -> if "1+2" is literal "1+2", then %0 is "1+2".
            // Typically arguments to @tr are parsed. @tr obj/attr=[v(foo)].
            // So we should parse 'triggerArgsRaw' first? 
            // In typical MUX command parsing, the whole command line is parsed before command exec.
            // Our system: `middleware` parses command line args if `eval` is not handled.
            // But `args` passed to `exec` are regex matches.
            // The regex matches raw string from the input (after initial parsing?).
            // If the user typed `@tr obj/attr=[v(foo)]`, `args[2]` is `[v(foo)]`.
            // We should evaluate `args[2]` if we want standard behavior, OR split it?
            // MUX: @trigger <object>/<attribute>=<arg1>,<arg2>,...
            // "The arguments are evaluated."
            // So we should split by comma (respecting nesting?), then evaluate each?
            // Or evaluate the whole string then split?
            // Usually: split raw string by comma -> evaluate each -> pass as %0, %1.
            
            const rawArgs = splitArgs(triggerArgsRaw);
            const evalArgs: string[] = [];
            for (const arg of rawArgs) {
                 evalArgs.push(await parser(arg.trim(), { data: { ...ctx.data } }));
            }
            
            // Evaluate attribute with args
            const result = await parser(attr.value, { 
                data: { enactor: en, ...ctx.data }, 
                registers: {}, 
                args: evalArgs 
            }); 
            
            if (result.trim()) {
                await force(ctx, result);
            } else {
                 send([ctx.socket.id], `Triggered ${tarName}/${attrName}.`, {});
            }
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

    addCmd({
        name: "@switch",
        pattern: /^@switch\s+(.*)\s*=\s*(.*)/i,
        lock: "connected",
        exec: async (ctx, args) => {
             // args[0] is test
             // args[1] is "case1,action1,case2,action2,...,default" (maybe)
             // Parsing args[1] is tricky if it contains commas.
             // Standard MUX @switch splits by comma/semicolon but respects nesting.
             // We'll use a simple split for now, or `splitArgs` if exposed.
             // `parser.ts` has `splitArgs` but it's not exported.
             // We should export it or duplicate it.
             // Duplicating for now or using simple split if needed.
             // Actually, `args[1]` comes from regex `(.*)`.
             // We need to implement a splitter that respects `{}, [], ()`.
             
             // Evaluate test
             const test = await parser(args[0], { data: { ...ctx.data }});
             
             const rest = args[1];
             const parts = splitArgs(rest); 
             
             let matchFound = false;
             
             for(let i=0; i<parts.length-1; i+=2) {
                 const pattern = parts[i].trim();
                 const action = parts[i+1].trim();
                 
                 // Evaluate pattern? MUX evaluates pattern?
                 // Usually patterns are literal with wildcards, but can be evaluated [func()].
                 // We'll evaluate pattern.
                 const evalPattern = await parser(pattern, { data: { ...ctx.data }});
                 
                 // Check match
                 // MUX uses glob matching. We'll use strict equality for MVP.
                 if (evalPattern === test) {
                     await force(ctx, action);
                     matchFound = true;
                     break;
                 }
             }
             
             // Default case
             if (!matchFound && parts.length % 2 !== 0) {
                 const def = parts[parts.length-1].trim();
                 await force(ctx, def);
             }
        }
    });
};
