/**
 * Player jobs preferences (silence / nospam) — Anomaly JOBS_SILENCE /
 * JOBS_NOSPAM equivalents under state.jobs.
 */
import type { IUrsamuSDK } from "@ursamu/mush";

export interface IJobsPrefs {
  /** Suppress staff bucket broadcast lines. */
  silence?: boolean;
  /** Suppress auto @mail to job originator. */
  nospam?: boolean;
  /** Per-bucket silence keys (uppercase bucket names). */
  silenceBuckets?: string[];
  /** Job numbers with silence. */
  silenceJobs?: number[];
  /** Job numbers with nospam. */
  nospamJobs?: number[];
}

export function getJobsPrefs(u: IUrsamuSDK): IJobsPrefs {
  return (u.me.state.jobs as IJobsPrefs) ?? {};
}

export async function setJobsPrefs(
  u: IUrsamuSDK,
  patch: Partial<IJobsPrefs>,
): Promise<void> {
  const cur = getJobsPrefs(u);
  await u.db.modify(u.me.id, "$set", {
    "state.jobs": { ...cur, ...patch },
  });
}

export function wantsNospam(u: IUrsamuSDK, jobNum?: number): boolean {
  const p = getJobsPrefs(u);
  if (p.nospam) return true;
  if (jobNum != null && (p.nospamJobs ?? []).includes(jobNum)) {
    return true;
  }
  return false;
}

export function wantsSilence(u: IUrsamuSDK, jobNum?: number): boolean {
  const p = getJobsPrefs(u);
  if (p.silence) return true;
  if (jobNum != null && (p.silenceJobs ?? []).includes(jobNum)) {
    return true;
  }
  return false;
}

export function toggleNum(list: number[] | undefined, n: number): number[] {
  const s = new Set(list ?? []);
  if (s.has(n)) s.delete(n);
  else s.add(n);
  return [...s];
}
