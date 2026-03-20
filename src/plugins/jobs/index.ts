import type { IPlugin } from "../../@types/IPlugin.ts";
import { registerPluginRoute } from "../../app.ts";
import { jobsRouteHandler } from "./router.ts";
// Import commands to trigger their addCmd registration at init time
import "./commands.ts";

export { jobHooks } from "./hooks.ts";
export type { JobHookMap } from "./hooks.ts";

const jobsPlugin: IPlugin = {
  name: "jobs",
  version: "1.0.0",
  description: "Anomaly-style jobs system — +request for players, +jobs for staff, bucket access control, escalation, archive",

  init: () => {
    registerPluginRoute("/api/v1/jobs", jobsRouteHandler);
    console.log("[jobs] Plugin initialized — +request/+jobs/+archive commands active, /api/v1/jobs routes registered");
    return true;
  },

  remove: () => {
    console.log("[jobs] Plugin removed");
  },
};

export default jobsPlugin;
