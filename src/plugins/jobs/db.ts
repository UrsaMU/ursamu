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
/** Initial staff restrictions seeded at registration time, keyed by uppercase bucket name. */
const _bucketStaffIds: Map<string, string[]> = new Map();

/** Options accepted per-bucket in {@link registerJobBuckets}. */
export interface IJobBucketOptions {
  /**
   * Player dbrefs (e.g. `"#1"`) that are pre-authorized to manage this
   * bucket.  An empty array (the default) means all staff can see it,
   * matching the engine's normal behaviour.  Pass a non-empty list to
   * restrict the bucket to specific staff members on first creation.
   */
  staffIds?: string[];
}

/**
 * Register additional job buckets so game plugins can extend the valid bucket
 * list without modifying the engine source.
 *
 * Each entry can be a plain string (no access restriction) or an object with
 * a `name` and optional `staffIds` to seed per-bucket staff access on first
 * startup.
 *
 * @example
 * ```ts
 * // Simple list — open to all staff
 * registerJobBuckets(["CGEN", "SPHERE", "PRP"]);
 *
 * // With per-bucket staff restrictions
 * registerJobBuckets([
 *   "PLOT",
 *   { name: "CGEN", staffIds: ["#5", "#7"] },
 * ]);
 * ```
 */
export function registerJobBuckets(
  buckets: (string | (IJobBucketOptions & { name: string }))[],
): void {
  for (const entry of buckets) {
    const name = typeof entry === "string" ? entry : entry.name;
    const upper = name.toUpperCase();
    _extraBuckets.add(upper);
    if (typeof entry !== "string" && entry.staffIds?.length) {
      _bucketStaffIds.set(upper, entry.staffIds);
    }
  }
}

/**
 * Returns the initial staff IDs seeded for a registered bucket, or `[]` if
 * none were specified (meaning all staff have access).
 */
export function getBucketStaffIds(bucket: string): string[] {
  return _bucketStaffIds.get(bucket.toUpperCase()) ?? [];
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
