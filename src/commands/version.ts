import { addCmd } from "../services/commands/index.ts";
import { send } from "../services/broadcast/index.ts";

export default () =>
  addCmd({
    name: "@version",
    pattern: /^@version$/i,
    lock: "connected",
    exec: async (u) => {
      const sid = u.socketId || "";
      try {
        const deno = JSON.parse(await Deno.readTextFile("./deno.json"));
        const version = deno.version || "unknown";

        // Get build date from git (last commit date)
        let buildDate = "unknown";
        try {
          const proc = new Deno.Command("git", {
            args: ["log", "-1", "--format=%aD"],
            stdout: "piped",
            stderr: "null",
          });
          const output = await proc.output();
          buildDate = new TextDecoder().decode(output.stdout).trim();
        } catch {
          // git not available, use file mtime
          try {
            const stat = await Deno.stat("./deno.json");
            if (stat.mtime) buildDate = stat.mtime.toUTCString();
          } catch { /* fallback */ }
        }

        // Get commit count
        let commitNum = "";
        try {
          const proc = new Deno.Command("git", {
            args: ["rev-list", "--count", "HEAD"],
            stdout: "piped",
            stderr: "null",
          });
          const output = await proc.output();
          commitNum = " #" + new TextDecoder().decode(output.stdout).trim();
        } catch { /* no git */ }

        send([sid], `%chUrsaMU ${version}${commitNum}%cn\nBuild date: ${buildDate}`);
      } catch {
        send([sid], "%ch>GAME:%cn Could not read version info.");
      }
    },
  });
