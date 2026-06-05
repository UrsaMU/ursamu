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
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }
  u.here.broadcast(`%chGame>%cn Server @reboot initiated by ${String(u.me.state.name || u.me.id)}...`);
  await u.sys.reboot();
}

addCmd({
  name: "@reboot",
  pattern: /^@reboot|^@restart/i,
  lock: "connected & admin+",
  category: "admin",
  help: `@reboot  — Reboot the game server (admin only).

Broadcasts a reboot message to all connected players before restarting.

Examples:
  @reboot
  @restart`,
  exec: execReboot,
});
