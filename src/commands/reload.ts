import { addCmd } from "../services/commands/index.ts";
import { loadSystemAliases, clearCmds } from "../services/commands/cmdParser.ts";
import { ConfigManager } from "../services/Config/index.ts";
import { registerPlugin } from "../services/Config/mod.ts";
import { loadTxtDir } from "../utils/loadTxtDir.ts";
import { reloadPlugins } from "../utils/loadPlugins.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";
import { dpath } from "../../deps.ts";

// Track loaded plugins for reload
let _loadedPlugins: import("../@types/IPlugin.ts").IPlugin[] = [];
export function setLoadedPlugins(plugins: import("../@types/IPlugin.ts").IPlugin[]) {
  _loadedPlugins = plugins;
}

addCmd({
    name: "reload",
    pattern: /^@reload(?:\/(\S+))?(?:\s+(.*))?$/i,
    lock: "connected & admin+",
    exec: async (u: IUrsamuSDK) => {
      const sw   = (u.cmd.args[0] || "").trim().toLowerCase();
      const name = (u.cmd.args[1] || "").trim().toLowerCase();
      const results: string[] = [];

      const reloadConfig = () => {
        try {
          const mgr = ConfigManager.getInstance();
          mgr.loadConfig();
          results.push("%chConfig:%cn reloaded from disk.");
        } catch (e) {
          results.push(`%crConfig reload failed:%cn ${e}`);
        }
      };

      const reloadText = async () => {
        try {
          await loadTxtDir("./text");
          results.push("%chText files:%cn reloaded.");
        } catch (e) {
          results.push(`%crText reload failed:%cn ${e}`);
        }
      };

      const reloadAliases = async () => {
        try {
          await loadSystemAliases();
          results.push("%chSystem aliases:%cn reloaded.");
        } catch (e) {
          results.push(`%crAlias reload failed:%cn ${e}`);
        }
      };

      const reloadCommands = async () => {
        try {
          clearCmds();
          const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
          const commandsDir = dpath.join(__dirname, ".");
          const cacheBuster = `?t=${Date.now()}`;
          const { plugins: loadDir } = await import("../utils/loadDIr.ts");
          await loadDir(commandsDir, cacheBuster);

          const isLocal = import.meta.url.startsWith("file://");
          const pluginsDir = isLocal
            ? dpath.join(__dirname, "../plugins")
            : dpath.join(Deno.cwd(), "src", "plugins");

          try {
            const { dfs } = await import("../../deps.ts");
            const entries = dfs.walk(pluginsDir, { match: [/commands\.ts$/], maxDepth: 3 });
            for await (const entry of entries) {
              if (entry.isFile) {
                await import(dpath.toFileUrl(entry.path).href + cacheBuster);
              }
            }
          } catch { /* plugins dir may not exist */ }

          results.push("%chNative commands:%cn reloaded.");
        } catch (e) {
          results.push(`%crCommands reload failed:%cn ${e}`);
        }
      };

      const reloadAllPlugins = async () => {
        try {
          const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
          const isLocal = import.meta.url.startsWith("file://");
          const pluginsDir = isLocal
            ? dpath.join(__dirname, "../plugins")
            : dpath.join(Deno.cwd(), "src", "plugins");
          _loadedPlugins = await reloadPlugins(pluginsDir, _loadedPlugins);
          results.push(`%chPlugins:%cn ${_loadedPlugins.length} reloaded.`);
        } catch (e) {
          results.push(`%crPlugins reload failed:%cn ${e}`);
        }
      };

      const reloadOnePlugin = async (pluginName: string) => {
        const plugin = _loadedPlugins.find(p => p.name.toLowerCase() === pluginName);
        if (!plugin) {
          const names = _loadedPlugins.map(p => p.name).join(", ") || "none";
          results.push(`Plugin "%ch${pluginName}%cn" not found. Loaded: ${names}`);
          return;
        }
        try {
          if (plugin.remove) await plugin.remove();

          const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
          const isLocal = import.meta.url.startsWith("file://");
          const pluginsDir = isLocal
            ? dpath.join(__dirname, "../plugins")
            : dpath.join(Deno.cwd(), "src", "plugins");
          const entryPath = dpath.join(pluginsDir, plugin.name, "index.ts");
          const cacheBuster = `?t=${Date.now()}`;

          const mod = await import(dpath.toFileUrl(entryPath).href + cacheBuster);
          if (!mod.default || typeof mod.default !== "object") {
            results.push(`%crPlugin "%ch${pluginName}%cr" reload failed%cn — no default export.`);
            return;
          }
          const fresh = mod.default;
          if (!fresh.name) fresh.name = plugin.name;
          if (!fresh.version) fresh.version = "0.0.1";
          if (fresh.init) await fresh.init();

          _loadedPlugins = _loadedPlugins.map(p => p.name === plugin.name ? fresh : p);
          registerPlugin(fresh);

          results.push(`%chPlugin "%cn${fresh.name}%ch" v${fresh.version}:%cn reloaded.`);
        } catch (e) {
          results.push(`%crPlugin "${pluginName}" reload failed:%cn ${e}`);
        }
      };

      switch (sw) {
        case "":
        case "all":
          reloadConfig();
          await reloadText();
          await reloadAliases();
          await reloadCommands();
          await reloadAllPlugins();
          results.push("(System scripts are always live — no reload needed.)");
          break;
        case "config":
          reloadConfig();
          break;
        case "text":
          await reloadText();
          break;
        case "cmds":
          await reloadAliases();
          await reloadCommands();
          break;
        case "plugins":
          await reloadAllPlugins();
          break;
        case "plugin":
          if (!name) {
            results.push("Usage: @reload/plugin <name>");
            results.push(`Loaded: ${_loadedPlugins.map(p => p.name).join(", ") || "none"}`);
          } else {
            await reloadOnePlugin(name);
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
    },
  });
