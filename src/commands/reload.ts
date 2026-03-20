import { addCmd } from "../services/commands/index.ts";
import { loadSystemAliases, clearCmds } from "../services/commands/cmdParser.ts";
import { ConfigManager } from "../services/Config/index.ts";
import { loadTxtDir } from "../utils/loadTxtDir.ts";
import { reloadPlugins } from "../utils/loadPlugins.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";
import { dpath } from "../../deps.ts";

// Track loaded plugins for reload
let _loadedPlugins: import("../@types/IPlugin.ts").IPlugin[] = [];
export function setLoadedPlugins(plugins: import("../@types/IPlugin.ts").IPlugin[]) {
  _loadedPlugins = plugins;
}

export default () =>
  addCmd({
    name: "reload",
    pattern: /^@reload(?:\s+(.*))?$/i,
    lock: "connected & admin+",
    exec: async (u: IUrsamuSDK) => {
      const arg = (u.cmd.args[0] || "").trim().toLowerCase();
      const results: string[] = [];

      const reloadConfig = () => {
        try {
          const mgr = ConfigManager.getInstance();
          mgr.loadConfig();
          results.push("Config reloaded from disk.");
        } catch (e) {
          results.push(`Config reload failed: ${e}`);
        }
      };

      const reloadText = async () => {
        try {
          await loadTxtDir("./text");
          results.push("Text files reloaded.");
        } catch (e) {
          results.push(`Text reload failed: ${e}`);
        }
      };

      const reloadAliases = async () => {
        try {
          await loadSystemAliases();
          results.push("System aliases reloaded.");
        } catch (e) {
          results.push(`Alias reload failed: ${e}`);
        }
      };

      const reloadCommands = async () => {
        try {
          // Clear all registered legacy commands
          clearCmds();

          // Determine commands directory
          const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
          const commandsDir = dpath.join(__dirname, ".");

          // Re-import all command files with cache-busting
          const cacheBuster = `?t=${Date.now()}`;
          const { plugins: loadDir } = await import("../utils/loadDIr.ts");
          await loadDir(commandsDir, cacheBuster);

          // Also reload plugin command files (they register via addCmd too)
          const isLocal = import.meta.url.startsWith("file://");
          const pluginsDir = isLocal
            ? dpath.join(__dirname, "../plugins")
            : dpath.join(Deno.cwd(), "src", "plugins");

          try {
            const { dfs } = await import("../../deps.ts");
            const entries = dfs.walk(pluginsDir, { match: [/commands\.ts$/], maxDepth: 3 });
            for await (const entry of entries) {
              if (entry.isFile) {
                const url = dpath.toFileUrl(entry.path).href + cacheBuster;
                await import(url);
              }
            }
          } catch { /* plugins dir may not exist */ }

          results.push(`Commands reloaded (${cacheBuster}).`);
        } catch (e) {
          results.push(`Commands reload failed: ${e}`);
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
          results.push(`Plugins reloaded (${_loadedPlugins.length} loaded).`);
        } catch (e) {
          results.push(`Plugins reload failed: ${e}`);
        }
      };

      reloadConfig();
      await reloadText();
      await reloadAliases();
      await reloadCommands();
      await reloadAllPlugins();

      results.push("(System scripts are always live -- no reload needed.)");
      u.send(results.join("%r"));
    },
  });
