import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { git } from "../services/git/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { dpath } from "../../deps.ts";

export default () => {
    addCmd({
        name: "@git/init",
        pattern: /^@git\/init\s+(.*)/i,
        lock: "wizard",
        help: "Initialize the softcode repository: @git/init <repo_url>",
        category: "developer",
        exec: async (ctx, args) => {
            const [url] = args;
            send([ctx.socket.id], "Cloning repo... please wait.");
            try {
                await git.init(url);
                send([ctx.socket.id], "Repo cloned successfully.");
            } catch (e) {
                send([ctx.socket.id], `Error: ${(e as Error).message}`, { error: true });
            }
        }
    });

    addCmd({
        name: "@git/pull",
        pattern: /^@git\/pull/i,
        lock: "wizard",
        help: "Pull changes and load into DB",
        category: "developer",
        exec: async (ctx) => {
             send([ctx.socket.id], "Pulling...");
             try {
                 await git.pull();
                 send([ctx.socket.id], "Pulled. Loading files...");
                 
                 // Loader Logic
                 // Iterate over files in repo, match to DB objects?
                 // Convention: <dbref>.json ? Or <name>.yaml?
                 // Let's assume <dbref>.json for now for robust syncing.
                 
                 let count = 0;
                 for await (const entry of Deno.readDir(git.path)) {
                     if (entry.isFile && entry.name.endsWith(".json")) {
                         const content = await Deno.readTextFile(dpath.join(git.path, entry.name));
                         try {
                             const data = JSON.parse(content);
                             if (data.id) {
                                 await dbojs.modify({ id: data.id }, "$set", data);
                                 count++;
                             }
                         } catch { /* ignore */ }
                     }
                 }

                 send([ctx.socket.id], `Loaded ${count} objects.`);
             } catch (e) {
                 send([ctx.socket.id], `Error: ${(e as Error).message}`, { error: true });
             }
        }
    });

    addCmd({
        name: "@git/push",
        pattern: /^@git\/push\s+(.*)/i,
        lock: "wizard",
        help: "Dump DB to files and push: @git/push <message>",
        category: "developer",
        exec: async (ctx, args) => {
            const [msg] = args;
            if (!msg) return send([ctx.socket.id], "Message required.");
            
            send([ctx.socket.id], "Dumping DB...");
            
            // Dump Logic
            // Dump all objects? Or just objects with a 'git' flag/tag?
            // For now, dump EVERYTHING (careful!). 
            // Better: only dump objects that have changed?
            // Or only dump specific list?
            // Let's dump everything for MVP 3.2
            
            const all = await dbojs.find({});
            for (const obj of all) {
                // Sanitize: remove password?
                const copy = { ...obj };
                if (copy.data?.password) delete copy.data.password;
                
                // Write to file
                await Deno.writeTextFile(dpath.join(git.path, `${obj.id}.json`), JSON.stringify(copy, null, 2));
            }
            
            try {
                await git.push(msg);
                send([ctx.socket.id], "Pushed successfully.");
            } catch (e) {
                send([ctx.socket.id], `Error: ${(e as Error).message}`, { error: true });
            }
        }
    });
};
