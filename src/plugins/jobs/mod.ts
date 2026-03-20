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

export { jobs, getNextJobNumber, registerJobBuckets, isValidBucket, getAllBuckets } from "./db.ts";
export { jobHooks } from "./hooks.ts";
export type { IJob, IJobComment } from "../../@types/IJob.ts";
