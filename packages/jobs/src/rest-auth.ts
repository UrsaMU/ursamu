/**
 * Pure REST auth helpers — no DB. Tested without KV.
 */
import type { IJob } from "./types.ts";

const STAFF = new Set(["admin", "wizard", "superuser"]);

/** Normalize stored flags to a lowercase Set (no substring matches). */
export function flagSetFromRaw(raw: unknown): Set<string> {
  if (raw instanceof Set) {
    return new Set([...raw].map((f) => String(f).toLowerCase()));
  }
  if (Array.isArray(raw)) {
    return new Set(raw.map((f) => String(f).toLowerCase()));
  }
  return new Set(
    String(raw || "")
      .split(/[\s,|]+/)
      .map((f) => f.toLowerCase())
      .filter(Boolean),
  );
}

/** True when flag set includes a staff privilege. */
export function isStaffFlagSet(flags: Set<string>): boolean {
  for (const f of STAFF) {
    if (flags.has(f)) return true;
  }
  return false;
}

/**
 * Strip staff-only comments for non-staff REST responses.
 */
export function stripStaffComments(job: IJob): IJob {
  return {
    ...job,
    comments: job.comments.filter((c) => !c.staffOnly),
  };
}

/**
 * Can this user see the job at all?
 * Staff: yes. Players: own non-staffOnly jobs only.
 */
export function canViewJob(
  job: IJob,
  userId: string,
  staff: boolean,
): boolean {
  if (staff) return true;
  if (job.staffOnly) return false;
  return job.submittedBy === userId;
}

/**
 * Shape a job for the response body (strip private comments).
 */
export function presentJob(job: IJob, staff: boolean): IJob {
  return staff ? job : stripStaffComments(job);
}
