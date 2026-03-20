import type { IPlugin } from "../../@types/IPlugin.ts";
import { registerPluginRoute } from "../../app.ts";
import { jobsRouteHandler } from "./router.ts";
import { jobHooks } from "./hooks.ts";
import { wsService } from "../../services/WebSocket/index.ts";
import { send } from "../../services/broadcast/index.ts";
import { dbojs } from "../../services/Database/index.ts";
import { getAllBuckets, getBucketStaffIds, jobAccess } from "./db.ts";
// Import commands to trigger their addCmd registration at init time
import "./commands.ts";

export { jobHooks } from "./hooks.ts";
export type { JobHookMap } from "./hooks.ts";

const jobsPlugin: IPlugin = {
  name: "jobs",
  version: "1.0.0",
  description: "Anomaly-style jobs system — +request for players, +jobs for staff, bucket access control, escalation, archive",

  init: async () => {
    registerPluginRoute("/api/v1/jobs", jobsRouteHandler);

    // Seed per-bucket staff access for any buckets registered via registerJobBuckets()
    // Only creates access records that don't already exist (idempotent).
    for (const bucket of getAllBuckets()) {
      const staffIds = getBucketStaffIds(bucket);
      if (staffIds.length > 0) {
        const existing = await jobAccess.queryOne({ id: bucket });
        if (!existing) {
          await jobAccess.create({ id: bucket, staffIds });
        }
      }
    }

    // Notify all connected staff when a job is created (skip submitter, dedup by player)
    jobHooks.on("job:created", async (job) => {
      const sockets = wsService.getConnectedSockets();
      const notified = new Set<string>();
      for (const sock of sockets) {
        if (!sock.cid || sock.cid === job.submittedBy || notified.has(sock.cid)) continue;
        const playerObj = await dbojs.queryOne({ id: sock.cid });
        if (!playerObj) continue;
        const flags = playerObj.flags || "";
        if (flags.includes("superuser") || flags.includes("admin") || flags.includes("wizard")) {
          send([sock.id], `%ch>JOBS:%cn New ${job.bucket} job #${job.number}: "${job.title}" from ${job.submitterName}.`);
          notified.add(sock.cid);
        }
      }
    });

    console.log("[jobs] Plugin initialized — +request/+jobs/+archive commands active, /api/v1/jobs routes registered");
    return true;
  },

  remove: () => {
    console.log("[jobs] Plugin removed");
  },
};

export default jobsPlugin;
