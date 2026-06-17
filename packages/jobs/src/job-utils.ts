// ─── Shared helpers used by player and staff command handlers ─────────────────

import { jobs, jobAccess } from "./db.ts";
import type { IJob } from "./types.ts";

/**
 * Resolves a job by sequential number.
 * Returns null if no matching job is found.
 */
export async function getJobByNumber(n: number): Promise<IJob | null> {
  const all = await jobs.find({});
  return all.find((j) => j.number === n) ?? null;
}

/**
 * Returns true when `staffId` is permitted to view `bucket`.
 *
 * Superusers bypass all restrictions. For everyone else, if the bucket has a
 * non-empty staffIds list then the caller must be in it; an empty list means
 * all staff can see the bucket.
 */
export async function canStaffSeeBucket(
  staffId: string,
  bucket: string,
  isSuperuser: boolean,
): Promise<boolean> {
  if (isSuperuser) return true;
  const access = await jobAccess.queryOne({ id: bucket });
  if (!access || access.staffIds.length === 0) return true;
  return access.staffIds.includes(staffId);
}
