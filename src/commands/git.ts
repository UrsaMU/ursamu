import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { git } from "../services/git/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { dpath } from "../../deps.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () => {
  addCmd({
    name: "@git/init",
    pattern: /^@git\/init\s+(.*)/i,
    lock: "wizard",
    help: "Initialize the softcode repository: @git/init <repo_url>",
    category: "developer",
    exec: async (u: IUrsamuSDK) => {
      const url = u.cmd.args[0];
      send([u.socketId || ""], "Cloning repo... please wait.");
      try {
        await git.init(url);
        send([u.socketId || ""], "Repo cloned successfully.");
      } catch (e) {
        console.error("[Git] @git/init error:", e);
        send([u.socketId || ""], "Git clone failed. Check server logs for details.", { error: true });
      }
    },
  });

  addCmd({
    name: "@git/pull",
    pattern: /^@git\/pull/i,
    lock: "wizard",
    help: "Pull changes and load into DB",
    category: "developer",
    exec: async (u: IUrsamuSDK) => {
      send([u.socketId || ""], "Pulling...");
      try {
        await git.pull();
        send([u.socketId || ""], "Pulled. Loading files...");
        let count = 0;
        for await (const entry of Deno.readDir(git.path)) {
          if (entry.isFile && entry.name.endsWith(".json")) {
            const content = await Deno.readTextFile(dpath.join(git.path, entry.name));
            try {
              const data = JSON.parse(content);
              if (data.id) {
                // Only allow safe fields — never overwrite flags or password from repo files
                const safe: Record<string, unknown> = {};
                if (data.data) {
                  const { password: _pw, ...safeData } = data.data;
                  safe.data = safeData;
                }
                if (data.location) safe.location = data.location;
                await dbojs.modify({ id: data.id }, "$set", safe);
                count++;
              }
            } catch { /* ignore */ }
          }
        }
        send([u.socketId || ""], `Loaded ${count} objects.`);
      } catch (e) {
        console.error("[Git] @git/pull error:", e);
        send([u.socketId || ""], "Git pull failed. Check server logs for details.", { error: true });
      }
    },
  });

  addCmd({
    name: "@git/push",
    pattern: /^@git\/push\s+(.*)/i,
    lock: "wizard",
    help: "Dump DB to files and push: @git/push <message>",
    category: "developer",
    exec: async (u: IUrsamuSDK) => {
      const msg = u.cmd.args[0];
      if (!msg) return send([u.socketId || ""], "Message required.");
      send([u.socketId || ""], "Dumping DB...");
      const all = await dbojs.find({});
      for (const obj of all) {
        const copy = { ...obj };
        if (copy.data?.password) delete copy.data.password;
        await Deno.writeTextFile(
          dpath.join(git.path, `${obj.id}.json`),
          JSON.stringify(copy, null, 2)
        );
      }
      try {
        await git.push(msg);
        send([u.socketId || ""], "Pushed successfully.");
      } catch (e) {
        console.error("[Git] @git/push error:", e);
        send([u.socketId || ""], "Git push failed. Check server logs for details.", { error: true });
      }
    },
  });
};
