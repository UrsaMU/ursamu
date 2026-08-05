/**
 * IPlugin bootstrap for the help system.
 *
 * Phase 1: commands.ts + routes.ts at load
 * Phase 2: providers + staff nav
 * Phase 3: remove providers / nav
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
import {
  HELP_DESCRIPTION,
  HELP_PLUGIN_ID,
  HELP_TITLE,
  HELP_VERSION,
} from "./version.ts";
import {
  registerHelpStaffNav,
  unregisterHelpStaffNav,
} from "./staff-nav-bridge.ts";

const commandProvider = new CommandProvider();
const fileProvider = new FileProvider();
const dbProvider = new DbProvider();

const onReady = async (): Promise<void> => {
  bustCache();
  const n = (await fileProvider.all()).length;
  console.log(`[help] File cache ready (${n} file topic(s)).`);
  void registerHelpStaffNav();
};

export const plugin: IPlugin = {
  name: HELP_PLUGIN_ID,
  version: HELP_VERSION,
  description: `${HELP_TITLE} — ${HELP_DESCRIPTION}`,

  init: () => {
    registerHelpDir(
      new URL("../help", import.meta.url),
      "help",
    );

    helpRegistry.addProvider(dbProvider);
    helpRegistry.addProvider(fileProvider);
    helpRegistry.addProvider(commandProvider);

    gameHooks.on("engine:ready", onReady);
    void registerHelpStaffNav();
    return true;
  },

  remove: () => {
    gameHooks.off("engine:ready", onReady);
    void unregisterHelpStaffNav();
    helpRegistry.removeProvider(dbProvider);
    helpRegistry.removeProvider(fileProvider);
    helpRegistry.removeProvider(commandProvider);
  },
};

export default plugin;
