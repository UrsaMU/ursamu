import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { git } from "../services/git/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { dpath } from "../../deps.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

// Allowed top-level fields when loading game objects from the git repo.
// Any object that contains fields outside this set, or that carries a
// password field, is rejected — it cannot overwrite sensitive DB data.
const ALLOWED_TOP_LEVEL = new Set(["id", "flags", "data", "location", "contents"]);
const FORBIDDEN_DATA_FIELDS = new Set(["password", "resetToken", "resetTokenExpiry", "failedAttempts"]);

export function validateGitObject(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return false;
  // Reject unknown top-level fields
  for (const key of Object.keys(o)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) return false;
  }
  // Reject forbidden data fields (e.g. injecting a password hash)
  if (o.data && typeof o.data === "object") {
    for (const key of Object.keys(o.data as Record<string, unknown>)) {
      if (FORBIDDEN_DATA_FIELDS.has(key)) return false;
    }
  }
  return true;
}

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
        send([u.socketId || ""], `Error: ${(e as Error).message}`, { error: true });
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
              if (validateGitObject(data)) {
                await dbojs.modify({ id: data.id }, "$set", data);
                count++;
              }
            } catch { /* ignore */ }
          }
        }
        send([u.socketId || ""], `Loaded ${count} objects.`);
      } catch (e) {
        send([u.socketId || ""], `Error: ${(e as Error).message}`, { error: true });
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
        send([u.socketId || ""], `Error: ${(e as Error).message}`, { error: true });
      }
    },
  });
};
