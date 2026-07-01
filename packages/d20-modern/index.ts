import "./commands.ts";
import type { IPlugin } from "@ursamu/ursamu";
import { registerHelpDir } from "@ursamu/help-plugin";

export const plugin: IPlugin = {
  name: "d20-modern",
  version: "1.0.0",
  description: "d20 Modern system plugin for UrsaMU.",
  dependencies: [
    { name: "help", version: ">=1.0.0" }
  ],

  init: () => {
    registerHelpDir(
      new URL("./help", import.meta.url).pathname,
      "d20-modern"
    );
    return true;
  },

  remove: () => {}
};
