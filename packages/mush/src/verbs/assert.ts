// deno-lint-ignore-file require-await
import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";

// ── @assert ───────────────────────────────────────────────────────────────

addCmd({
  name: "@assert",
  pattern: /^@assert\s+(.*?)(?:\s*=\s*(.*))?$/i,
  lock: "connected",
  category: "Scripting",
  help: `@assert <condition>[=<message>]  — Halt if condition is false.

  Evaluates <condition>; if 0 or empty, sends optional <message> and stops.
  Primarily used inside @dolist or @while to abort on bad input.

Examples:
  @assert [isnum(%0)]=Bad: %0 is not a number.
  @assert [gt(%0,0)]=Value must be positive.`,
  exec: async (u: IUrsamuSDK) => {
    const condition = (u.cmd.args[0] ?? "").trim();
    const message   = (u.cmd.args[1] ?? "").trim();
    const fails = !condition || condition === "0" || condition.toLowerCase() === "false";
    if (fails && message) u.send(message);
  },
});

// ── @version ─────────────────────────────────────────────────────────────

addCmd({
  name: "@version",
  pattern: /^@version$/i,
  lock: "connected",
  category: "System",
  help: `@version  — Display the server version and build date.

Examples:
  @version`,
  exec: async (u: IUrsamuSDK) => {
    try {
      const denoJson = JSON.parse(await Deno.readTextFile("./deno.json"));
      const version = (denoJson.version as string | undefined) ?? "unknown";

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
        try {
          const stat = await Deno.stat("./deno.json");
          if (stat.mtime) buildDate = stat.mtime.toUTCString();
        } catch (e: unknown) { void e; }
      }

      let commitNum = "";
      try {
        const proc = new Deno.Command("git", {
          args: ["rev-list", "--count", "HEAD"],
          stdout: "piped",
          stderr: "null",
        });
        const output = await proc.output();
        commitNum = " #" + new TextDecoder().decode(output.stdout).trim();
      } catch (e: unknown) { void e; }

      u.send(`%chUrsaMU ${version}${commitNum}%cn\nBuild date: ${buildDate}`);
    } catch (e: unknown) {
      void e;
      u.send("%ch>GAME:%cn Could not read version info.");
    }
  },
});
