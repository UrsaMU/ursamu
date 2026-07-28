import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { log, send, DBO } from "@ursamu/core";
import { dbojs, chans, counters } from "../world/dbobjs.ts";

// mail-plugin owns "mail.messages" — access directly to avoid plugin coupling
const mailDb = new DBO<{ id: string }>("mail.messages");

// Track loaded plugins for reload
type IPlugin = { name: string; version?: string; init?(): unknown; remove?(): Promise<void> | void };
let _loadedPlugins: IPlugin[] = [];
export function setLoadedPlugins(plugins: IPlugin[]): void {
  _loadedPlugins = plugins;
}

export async function execReload(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }

  const sw   = (u.cmd.args[0] || "").trim().toLowerCase();
  const name = (u.cmd.args[1] || "").trim().toLowerCase();
  const results: string[] = [];

  switch (sw) {
    case "":
    case "all":
      results.push("(System scripts are always live — no reload needed.)");
      results.push("Triggering server reboot to reload all components...");
      try {
        await u.sys.reboot();
      } catch (e: unknown) {
        results.push(`%crReboot failed:%cn ${e}`);
      }
      break;

    case "config":
      results.push("Config reload requires engine access — use @shutdown/@reboot to apply changes.");
      break;

    case "text":
      results.push("Text file reload requires engine access — use @shutdown/@reboot to apply changes.");
      break;

    case "cmds":
      results.push("Command reload requires engine access — use @shutdown/@reboot to apply changes.");
      break;

    case "plugins":
      if (_loadedPlugins.length === 0) {
        results.push("No plugins tracked. Use @reload/all to trigger a full restart.");
        break;
      }
      results.push(`%chPlugins:%cn ${_loadedPlugins.map(p => p.name).join(", ")} — use @reload/all to restart.`);
      break;

    case "plugin":
      if (!name) {
        results.push("Usage: @reload/plugin <name>");
        results.push(`Loaded: ${_loadedPlugins.map(p => p.name).join(", ") || "none"}`);
        break;
      }
      {
        const plugin = _loadedPlugins.find(p => p.name.toLowerCase() === name);
        if (!plugin) {
          const names = _loadedPlugins.map(p => p.name).join(", ") || "none";
          results.push(`Plugin "%ch${name}%cn" not found. Loaded: ${names}`);
          break;
        }
        try {
          if (plugin.remove) await plugin.remove();
          results.push(`%chPlugin "%cn${plugin.name}%ch":%cn unloaded. Use @reload/all for full restart.`);
        } catch (e: unknown) {
          results.push(`%crPlugin "${name}" unload failed:%cn ${e}`);
        }
      }
      break;

    default:
      results.push(
        `Unknown switch "/${sw}". ` +
        `Valid: @reload, @reload/all, @reload/config, @reload/text, ` +
        `@reload/cmds, @reload/plugins, @reload/plugin <name>`
      );
  }

  u.send(results.join("%r"));
}

export async function execNuke(u: IUrsamuSDK): Promise<void> {
  const isSuperuser = u.me.flags.has("superuser");
  if (!isSuperuser) { u.send("Permission denied."); return; }

  const confirm = (u.cmd.args[0] || "").trim().toLowerCase();
  const socketId = u.socketId || "";

  if (confirm !== "confirm") {
    send([socketId], "%ch%cr--- WARNING ---%cn");
    send([socketId], "This will %ch%crPERMANENTLY DELETE%cn the entire database:");
    send([socketId], "  - All players (except you — you'll be recreated)");
    send([socketId], "  - All rooms, things, and exits");
    send([socketId], "  - All channels");
    send([socketId], "  - All mail");
    send([socketId], "");
    send([socketId], "Type %ch@nuke confirm%cn to proceed.");
    send([socketId], "%ch%crThis cannot be undone.%cn");
    return;
  }

  await log("warn", "NUKE_INITIATED", { actor: u.me.id });

  u.here.broadcast("%ch%cr[SYSTEM]%cn Database nuke initiated. Server will restart momentarily.");

  try {
    const objects = await dbojs.find({});
    for (const obj of objects) {
      await dbojs.delete({ id: obj.id });
    }

    const channels = await chans.find({});
    for (const ch of channels) {
      await chans.delete({ id: ch.id });
    }

    const mails = await mailDb.find({});
    for (const m of mails) {
      await mailDb.delete({ id: m.id });
    }

    const ctrs = await counters.find({});
    for (const c of ctrs) {
      await counters.delete({ id: c.id });
    }
  } catch (e: unknown) {
    send([socketId], `%crNuke error during wipe:%cn ${e}`);
    return;
  }

  send([socketId], "%ch%cgDatabase wiped.%cn Server will restart to reinitialize.");
  send([socketId], "You will need to create a new superuser on restart.");

  const { markSoftReboot } = await import("../sys/reboot-flag.ts");
  markSoftReboot();
  setTimeout(() => Deno.exit(75), 500);
}

addCmd({
  name: "@reload",
  pattern: /^@reload(?:\/(\S+))?(?:\s+(.*))?$/i,
  lock: "connected & admin+",
  help: "Reload server components",
  category: "admin",
  exec: execReload,
});

addCmd({
  name: "@nuke",
  pattern: /^@nuke(?:\s+(.*))?$/i,
  lock: "superuser",
  help: "Permanently wipe the entire database",
  category: "admin",
  exec: execNuke,
});

export async function execReboot(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
  if (!isAdmin) {
    u.send("Permission denied.");
    return;
  }

  // args: [0]=switch (quick|check|...), [1]=optional branch
  const sw = (u.cmd.args[0] || "").trim().toLowerCase();
  const branch = (u.cmd.args[1] || "").trim();
  const quick = sw === "quick" || sw === "noreload" ||
    sw === "skip";
  const check = sw === "check" || sw === "status" || sw === "dry";
  const who = String(u.me.state.name || u.me.name || u.me.id);

  if (check) {
    try {
      const { runCodebaseUpdate } = await import(
        "../sys/codebase-update.ts"
      );
      const result = await runCodebaseUpdate({
        branch,
        checkOnly: true,
        log: (line) => u.send(`%chGame>%cn ${line}`),
      });
      if (!result.ok) {
        u.send("%cr@restart/check failed.%cn");
      }
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      u.send(`%cr@restart/check failed:%cn ${m}`);
    }
    return;
  }

  if (quick) {
    u.here.broadcast(
      `%chGame>%cn quick @restart by %ch${who}%cn.`,
    );
    try {
      await u.sys.reboot({ update: false });
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      u.send(`%crReboot failed:%cn ${m}`);
    }
    return;
  }

  // Full update: prepare while live, reboot only if cache warmed.
  u.here.broadcast(
    `%chGame>%cn full @restart by %ch${who}%cn.`,
  );
  try {
    const { runCodebaseUpdate } = await import(
      "../sys/codebase-update.ts"
    );
    const result = await runCodebaseUpdate({
      branch,
      log: (line) => u.send(`%chGame>%cn ${line}`),
    });
    if (!result.ok || !result.cached) {
      u.send(
        "%crUpdate failed — game left running " +
          "(no reboot).%cn",
      );
      return;
    }
    await u.sys.reboot({ update: false });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e);
    u.send(
      `%crUpdate failed — game left running:%cn ${m}`,
    );
  }
}

addCmd({
  name: "@reboot",
  pattern: /^@(?:reboot|restart)(?:\/(\S+))?(?:\s+(.*))?$/i,
  lock: "connected & admin+",
  category: "admin",
  help: `@restart              — Prepare packages online, then soft-reboot.
@restart/check         — List outdated pins (no write, no reboot).
@restart/quick         — Soft-reboot only (no git/JSR).
@restart <branch>      — Pull that branch, then prepare + reboot.

Prepare (game stays up):
  git pull → exact jsr:@ursamu/* pins + dual-package
  overrides → wipe deno.lock + node_modules →
  deno cache --reload. Soft-reboot only if cache OK.
Local ./vendor/* pins update only via git pull.
Unpublished monorepo code is NOT loaded — publish to
JSR first. Telnet stays up; failures leave the game up.

Examples:
  @restart/check
  @restart
  @restart/quick`,
  exec: execReboot,
});
