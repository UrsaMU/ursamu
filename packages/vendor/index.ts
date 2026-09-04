import "./commands.ts";
import type { IPlugin } from "@ursamu/mush";

export const plugin: IPlugin = {
  name: "vendor",
  version: "1.1.0",
  description: "Generic Shop Vendor plugin for UrsaMU — supports " +
    "creating shops and buy/sell transaction hooks.",
  dependencies: [],

  init: () => {
    return true;
  },

  remove: () => {
    // Teardown logic
  }
};

export default plugin;
