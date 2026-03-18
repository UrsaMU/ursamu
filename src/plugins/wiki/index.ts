import type { IPlugin } from "../../@types/IPlugin.ts";
import { registerPluginRoute } from "../../app.ts";
import { wikiRouteHandler } from "./router.ts";
import "./commands.ts";

const wikiPlugin: IPlugin = {
  name: "wiki",
  version: "2.0.0",
  description: "File-based wiki — folder-driven routing over the wiki/ directory",

  init: () => {
    registerPluginRoute("/api/v1/wiki", wikiRouteHandler);
    console.log("[wiki] Plugin initialized — +wiki commands active, /api/v1/wiki routes registered");
    return true;
  },

  remove: () => {
    console.log("[wiki] Plugin removed");
  },
};

export default wikiPlugin;
