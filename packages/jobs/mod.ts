/**
 * @module @ursamu/jobs
 * @description Anomaly-style jobs/request system for UrsaMU.
 *
 * Self-contained — provides its own types, database layer, and event hooks.
 * The engine (`@ursamu/mush`) is only used for infrastructure primitives
 * (DBO, addCmd, registerRoute, etc.); no jobs knowledge lives there.
 *
 * Install via `plugins.manifest.json`:
 * ```json
 * { "plugins": [{ "name": "jobs", "url": "https://github.com/UrsaMU/jobs-plugin", "ref": "v1.1.0" }] }
 * ```
 *
 * Subscribe to job lifecycle events in another plugin:
 * ```ts
 * import { jobHooks } from "@ursamu/jobs";
 * jobHooks.on("job:created", (job) => console.log(job.title));
 * ```
 */

// Domain types
export { VALID_BUCKETS } from "./src/types.ts";
export type { IJob, IJobComment, IJobAccess, JobBucket } from "./src/types.ts";

// Database layer
export { jobs, jobArchive, jobAccess, getNextJobNumber, registerJobBuckets, isValidBucket, getAllBuckets, getBucketStaffIds } from "./src/db.ts";
export type { IJobBucketOptions } from "./src/db.ts";

// Event hooks
export { jobHooks } from "./src/hooks.ts";
export type { IJobHooks, JobHookMap } from "./src/hooks.ts";

// Format helpers (used by other plugins that render job data)
export { isStaffFlags, header, jobHeader, jobFooter, divider, jobDivider, footer, formatTimeFull, formatTimeShort, formatDate, getEscalation, isNew, formatJobList, WIDTH } from "./src/format.ts";

// Plugin entry point
export { default } from "./src/index.ts";
