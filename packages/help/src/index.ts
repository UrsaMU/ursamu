/**
 * src/index.ts — IPlugin bootstrap for the help system.
 *
 * Phase 1 (module load): imports commands.ts — addCmd() at load time.
 * Phase 2 (init):        providers + own help dir; prime on engine:ready
 *                        after every plugin has called registerHelpDir.
 * Phase 3 (remove):      remove providers + ready listener.
 */

import "./commands.ts";
import "./hooks.ts";
import "./routes.ts";
import type { IPlugin } from "@ursamu/mush";
import { gameHooks } from "@ursamu/mush";
import { helpRegistry } from "./registry.ts";
import { CommandProvider } from "./providers/command.ts";
import {
  FileProvider,
  registerHelpDir,
  bustCache,
} from "./providers/file.ts";
import { DbProvider } from "./providers/database.ts";

const commandProvider = new CommandProvider();
const fileProvider = new FileProvider();
const dbProvider = new DbProvider();

/** After all plugins init, rebuild once from every registerHelpDir. */
const onReady = async (): Promise<void> => {
  bustCache();
  const n = (await fileProvider.all()).length;
  console.log(`[help] File cache ready (${n} file topic(s)).`);
};

export const plugin: IPlugin = {
  name: "help",
  version: "1.0.1",
  description:
    "API-first help — command inline help, per-package help/ " +
    "folders via registerHelpDir, and runtime DB entries.",

  init: () => {
    // Own package help/ (file: checkout or JSR https://).
    registerHelpDir(
      new URL("../help", import.meta.url),
      "help",
    );

    helpRegistry.addProvider(dbProvider);
    helpRegistry.addProvider(fileProvider);
    helpRegistry.addProvider(commandProvider);

    gameHooks.on("engine:ready", onReady);
    return true;
  },

  remove: () => {
    gameHooks.off("engine:ready", onReady);
    helpRegistry.removeProvider(dbProvider);
    helpRegistry.removeProvider(fileProvider);
    helpRegistry.removeProvider(commandProvider);
  },
};

export default plugin;
