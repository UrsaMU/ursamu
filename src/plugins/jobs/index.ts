import type { IPlugin } from "../../@types/IPlugin.ts";
import { registerPluginRoute } from "../../app.ts";
import { jobsRouteHandler } from "./router.ts";
// Import commands to trigger their addCmd registration at init time
import "./commands.ts";

const jobsPlugin: IPlugin = {
  name: "jobs",
  version: "1.0.0",
  description: "Staff job/request tracking system with in-game commands and REST API",

  init: async () => {
    registerPluginRoute("/api/v1/jobs", jobsRouteHandler);
    console.log("[jobs] Plugin initialized — +job commands active, /api/v1/jobs routes registered");
    return true;
  },

  remove: async () => {
    console.log("[jobs] Plugin removed");
  },
};

export default jobsPlugin;
