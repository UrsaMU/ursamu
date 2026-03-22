/**
 * @module jobs
 * @description The UrsaMU Jobs (ticket/request) plugin.
 *
 * Provides the persistent job database, auto-incrementing job numbers,
 * typed lifecycle hooks, and the `IJob`/`IJobComment` data types.
 *
 * @example
 * ```ts
 * import { jobHooks } from "@ursamu/ursamu/jobs";
 *
 * jobHooks.on("job:created", (job) => {
 *   console.log(`New job #${job.number}: ${job.title}`);
 * });
 * ```
 */

export { jobs, jobArchive, jobAccess, getNextJobNumber, registerJobBuckets, isValidBucket, getAllBuckets, getBucketStaffIds } from "./db.ts";
export { jobHooks } from "./hooks.ts";
export type { IJob, IJobComment, IJobAccess } from "../../@types/IJob.ts";
