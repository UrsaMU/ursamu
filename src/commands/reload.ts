import { addCmd } from "../services/commands/index.ts";
import { loadSystemAliases } from "../services/commands/cmdParser.ts";
import { ConfigManager } from "../services/Config/index.ts";
import { loadTxtDir } from "../utils/loadTxtDir.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

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

      if (!arg || arg === "all") {
        reloadConfig();
        await reloadText();
        await reloadAliases();
      } else if (arg === "config") {
        reloadConfig();
      } else if (arg === "text") {
        await reloadText();
      } else if (arg === "aliases") {
        await reloadAliases();
      } else {
        u.send("Usage: @reload [config|text|aliases|all]");
        return;
      }

      results.push("(System scripts are always live -- no reload needed.)");
      u.send(results.join("%r"));
    },
  });
