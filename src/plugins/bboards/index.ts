import type { IPlugin } from "../../@types/IPlugin.ts";
import { registerPluginRoute } from "../../app.ts";
import { bboardsRouteHandler } from "./router.ts";
import "./commands.ts";

const bboardsPlugin: IPlugin = {
  name: "bboards",
  version: "1.0.0",
  description: "Bulletin board system with in-game @bb commands and REST API",

  init: () => {
    registerPluginRoute("/api/v1/boards", bboardsRouteHandler);
    console.log("[bboards] Plugin initialized — @bb commands active, /api/v1/boards routes registered");
    return true;
  },

  remove: () => {
    console.log("[bboards] Plugin removed");
  },
};

export default bboardsPlugin;
