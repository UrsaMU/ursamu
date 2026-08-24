import "../commands.ts";
import { gameHooks } from "@ursamu/mush";
import type { IPlugin } from "@ursamu/mush";
import { registerHelpDir } from "@ursamu/help/register";
import { registerWithGM } from "./gm-bridge.ts";
import "./hooks-augment.ts";
import {
  UTOPIA_DESCRIPTION,
  UTOPIA_PLUGIN_ID,
  UTOPIA_TITLE,
  UTOPIA_VERSION,
} from "./version.ts";

const onReady = () => {
  void registerWithGM();
};

export const plugin: IPlugin = {
  name: UTOPIA_PLUGIN_ID,
  version: UTOPIA_VERSION,
  description: `${UTOPIA_TITLE} — ${UTOPIA_DESCRIPTION}`,
  dependencies: [
    { name: "help", version: ">=1.0.0" },
  ],
  init: () => {
    registerHelpDir(
      new URL("../help", import.meta.url),
      UTOPIA_PLUGIN_ID,
    );
    gameHooks.on("engine:ready", onReady);
    return true;
  },
  remove: () => {
    gameHooks.off("engine:ready", onReady);
  },
};

export default plugin;
