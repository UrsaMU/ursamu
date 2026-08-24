// ─── Jobs plugin entry point ──────────────────────────────────────────────────

import "./commands.ts";
import { registerPluginRoute } from "@ursamu/mush";
import { registerHelpDir } from "@ursamu/help/register";
import { getAllBuckets, getBucketStaffIds, jobAccess } from "./db.ts";
import type { IPlugin } from "@ursamu/mush";
import { jobsRouteHandler } from "./router.ts";
import { registerNotifyHooks, removeNotifyHooks } from "./notify.ts";
import {
  JOBS_DESCRIPTION,
  JOBS_PLUGIN_ID,
  JOBS_TITLE,
  JOBS_VERSION,
} from "./version.ts";
import {
  registerJobsStaffNav,
  unregisterJobsStaffNav,
} from "./staff-nav-bridge.ts";
import {
  publishJobsOpenBadge,
  registerJobsBadgeHooks,
  removeJobsBadgeHooks,
} from "./staff-badge-bridge.ts";

/**
 * UrsaMU Jobs Plugin — full-featured jobs/request system.
 *
 * Registers +request, +job, +jobs, +archive commands and the
 * /api/v1/jobs REST routes. Staff console tab is plugin-owned
 * (`route: "jobs"` → /admin/jobs when @ursamu/web is present).
 *
 * Configure buckets from your game project before plugin init:
 * ```ts
 * import { registerJobBuckets } from "@ursamu/jobs";
 * registerJobBuckets(["PLOT", "BUILD", { name: "CGEN", staffIds: ["#5"] }]);
 * ```
 */
const bootstrapStaffUi = async (): Promise<void> => {
  await registerJobsStaffNav();
  registerJobsBadgeHooks();
  await publishJobsOpenBadge();
};

const jobsPlugin: IPlugin = {
  name: JOBS_PLUGIN_ID,
  version: JOBS_VERSION,
  description: `${JOBS_TITLE} — ${JOBS_DESCRIPTION}`,
  dependencies: [
    { name: "help", version: ">=1.0.0" },
  ],

  init: async () => {
    registerPluginRoute("/api/v1/jobs", jobsRouteHandler);
    registerNotifyHooks();
    registerHelpDir(
      new URL("../help", import.meta.url),
      JOBS_PLUGIN_ID,
    );

    // Seed per-bucket staff access for buckets with staffIds.
    // Idempotent — only creates missing access records.
    for (const bucket of getAllBuckets()) {
      const staffIds = getBucketStaffIds(bucket);
      if (
        staffIds.length > 0 &&
        !(await jobAccess.queryOne({ id: bucket }))
      ) {
        await jobAccess.create({ id: bucket, staffIds });
      }
    }

    // Fire-and-forget — soft-peer @ursamu/web may be absent.
    void bootstrapStaffUi();

    console.log(
      `[${JOBS_PLUGIN_ID}] ${JOBS_TITLE} — +request/+job/+jobs, ` +
        `/api/v1/jobs; staff UI via @ursamu/web /admin/jobs`,
    );
    return true;
  },

  remove: () => {
    removeNotifyHooks();
    removeJobsBadgeHooks();
    void unregisterJobsStaffNav();
    console.log("[jobs] Plugin removed.");
  },
};

export default jobsPlugin;
