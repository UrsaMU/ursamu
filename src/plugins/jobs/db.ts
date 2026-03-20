import { DBO } from "../../services/Database/database.ts";
import { counters } from "../../services/Database/index.ts";
import type { IJob, IJobAccess } from "../../@types/IJob.ts";
import { VALID_BUCKETS } from "../../@types/IJob.ts";

/** Persistent store for all job records. */
export const jobs: DBO<IJob> = new DBO<IJob>("server.jobs");
export const jobArchive: DBO<IJob> = new DBO<IJob>("server.jobs_archive");
export const jobAccess: DBO<IJobAccess> = new DBO<IJobAccess>("server.jobs_access");

/** Atomically increment and return the next sequential job number (1, 2, 3, …). */
export function getNextJobNumber(): Promise<number> {
  return counters.atomicIncrement("jobid");
}

// ---------------------------------------------------------------------------
// Plugin bucket registry
// ---------------------------------------------------------------------------

const _extraBuckets: Set<string> = new Set();

/**
 * Register additional job buckets so game plugins can extend the valid bucket
 * list without modifying the engine source.
 *
 * @example
 * ```ts
 * registerJobBuckets(["CGEN", "SPHERE", "PRP"]);
 * ```
 */
export function registerJobBuckets(buckets: string[]): void {
  for (const b of buckets) _extraBuckets.add(b.toUpperCase());
}

/** Returns `true` when `bucket` is a built-in bucket or has been registered via {@link registerJobBuckets}. */
export function isValidBucket(bucket: string): boolean {
  const upper = bucket.toUpperCase();
  return (VALID_BUCKETS as readonly string[]).includes(upper) ||
    _extraBuckets.has(upper);
}

/** Returns all currently valid bucket names (built-in + registered). */
export function getAllBuckets(): string[] {
  return [...VALID_BUCKETS, ..._extraBuckets];
}
