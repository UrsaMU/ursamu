// ─── Jobs plugin entry point ──────────────────────────────────────────────────

import "./commands.ts";
import { registerPluginRoute } from "@ursamu/mush";
import { getAllBuckets, getBucketStaffIds, jobAccess } from "./db.ts";
import type { IPlugin } from "@ursamu/mush";
import { jobsRouteHandler } from "./router.ts";
import { registerNotifyHooks, removeNotifyHooks } from "./notify.ts";

/**
 * UrsaMU Jobs Plugin — Anomaly-style jobs/request system.
 *
 * Registers +request, +job, +jobs, +archive commands and the /api/v1/jobs
 * REST routes. Staff are notified in-game when new jobs arrive.
 *
 * Configure buckets from your game project before plugin init:
 * ```ts
 * import { registerJobBuckets } from "@ursamu/jobs";
 * registerJobBuckets(["PLOT", "BUILD", { name: "CGEN", staffIds: ["#5"] }]);
 * ```
 */
const jobsPlugin: IPlugin = {
  name: "jobs",
  version: "1.0.0",
  description: "Anomaly-style jobs system — player requests, staff commands, bucket access, archive, REST API.",

  init: async () => {
    registerPluginRoute("/api/v1/jobs", jobsRouteHandler);
    registerNotifyHooks();

    // Seed per-bucket staff access for any buckets registered with staffIds.
    // Idempotent — only creates missing access records.
    for (const bucket of getAllBuckets()) {
      const staffIds = getBucketStaffIds(bucket);
      if (staffIds.length > 0 && !(await jobAccess.queryOne({ id: bucket }))) {
        await jobAccess.create({ id: bucket, staffIds });
      }
    }

    console.log("[jobs] Initialized — +request/+job/+jobs/+archive active, /api/v1/jobs registered.");
    return true;
  },

  remove: () => {
    removeNotifyHooks();
    console.log("[jobs] Plugin removed.");
  },
};

export default jobsPlugin;
