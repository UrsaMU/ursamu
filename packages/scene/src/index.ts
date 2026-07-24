import "./commands.ts";
import { subscribeSceneHooks, unsubscribeSceneHooks } from "./hooks.ts";
import type { IPlugin } from "@ursamu/mush";

const plugin: IPlugin = {
  name: "scene",
  version: "0.1.0",
  description: "Cross-platform scene plugin with instanced rooms, BBS logging, and Discord bridge integrations.",
  init: () => {
    subscribeSceneHooks();
    console.log("[scene] Plugin initialized");
    return true;
  },
  remove: () => {
    unsubscribeSceneHooks();
    console.log("[scene] Plugin removed");
  },
};

export default plugin;
