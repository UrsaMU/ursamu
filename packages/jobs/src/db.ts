// ─── Jobs database layer ───────────────────────────────────────────────────────

import { DBO } from "@ursamu/mush";
import type { IJob, IJobAccess } from "./types.ts";
import { VALID_BUCKETS } from "./types.ts";

/** Persistent store for all active job records. */
export const jobs = new DBO<IJob>("server.jobs");
/** Persistent store for closed/cancelled jobs. */
export const jobArchive = new DBO<IJob>("server.jobs_archive");
/** Per-bucket staff access lists. */
export const jobAccess = new DBO<IJobAccess>("server.jobs_access");

// Access the shared server.counters KV collection for atomic job-number generation.
// Creating a DBO handle here is safe — atomicIncrement uses Deno KV atomics
// and multiple handles on the same collection key are guaranteed consistent.
const _counters = new DBO<{ id: string; value: number }>("server.counters");

/** Atomically increment and return the next sequential job number (1, 2, 3, …). */
export function getNextJobNumber(): Promise<number> {
  return _counters.atomicIncrement("jobid");
}

// ─── Bucket registry ──────────────────────────────────────────────────────────

const _extraBuckets: Set<string> = new Set();
/** Initial staff restrictions seeded at registration time, keyed by uppercase bucket name. */
const _bucketStaffIds: Map<string, string[]> = new Map();

/** Options accepted per-bucket in {@link registerJobBuckets}. */
export interface IJobBucketOptions {
  /**
   * Player dbrefs (e.g. `"#1"`) that are pre-authorized to manage this bucket.
   * An empty array (the default) means all staff can see it. Pass a non-empty
   * list to restrict the bucket to specific staff on first creation.
   */
  staffIds?: string[];
}

/**
 * Register additional job buckets so game plugins can extend the valid bucket
 * list without modifying the plugin source.
 *
 * @example
 * ```ts
 * registerJobBuckets(["CGEN", "SPHERE"]);
 * registerJobBuckets([{ name: "CGEN", staffIds: ["#5", "#7"] }]);
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

/** Returns `true` when `bucket` is a built-in or registered bucket name. */
export function isValidBucket(bucket: string): boolean {
  const upper = bucket.toUpperCase();
  return (VALID_BUCKETS as readonly string[]).includes(upper) || _extraBuckets.has(upper);
}

/** Returns all currently valid bucket names (built-in + registered). */
export function getAllBuckets(): string[] {
  return [...VALID_BUCKETS, ..._extraBuckets];
}
