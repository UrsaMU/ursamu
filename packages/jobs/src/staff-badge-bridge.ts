/**
 * Publish live staff-console badges when @ursamu/web is present.
 *
 * `jobs:open` — count of open (non-closed/resolved) jobs.
 * Host also falls back to live store; plugin push stays in sync
 * after REST/in-game mutations.
 */

import { jobs } from "./db.ts";
import { jobHooks } from "./hooks.ts";

export const OPEN_KEY = "jobs:open";
const OPEN_TITLE = "Open jobs";

type BadgeApi = {
  setStaffBadge?: (
    key: string,
    count: number | string,
    title?: string,
  ) => void;
};

/** Match staff console live store open filter. */
function isOpenStatus(status: string): boolean {
  return status !== "closed" &&
    status !== "resolved" &&
    status !== "cancelled";
}

async function loadWebBadges(): Promise<BadgeApi | null> {
  try {
    const spec = "@ursamu/web";
    const mod = await import(spec) as BadgeApi;
    return mod;
  } catch {
    return null;
  }
}

/** Count open jobs for the staff badge. */
export async function countOpenJobs(): Promise<number> {
  try {
    const all = await jobs.query({});
    let n = 0;
    for (const j of all) {
      if (isOpenStatus(String(j.status ?? ""))) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

/** Recompute and push jobs:open. */
export async function publishJobsOpenBadge(): Promise<void> {
  const mod = await loadWebBadges();
  if (typeof mod?.setStaffBadge !== "function") return;
  const n = await countOpenJobs();
  mod.setStaffBadge(OPEN_KEY, n, OPEN_TITLE);
}

const refreshBadge = (): void => {
  void publishJobsOpenBadge();
};

/** Subscribe lifecycle hooks so the badge stays fresh. */
export function registerJobsBadgeHooks(): void {
  jobHooks.on("job:created", refreshBadge);
  jobHooks.on("job:status-changed", refreshBadge);
  jobHooks.on("job:closed", refreshBadge);
  jobHooks.on("job:resolved", refreshBadge);
  jobHooks.on("job:reopened", refreshBadge);
  jobHooks.on("job:deleted", refreshBadge);
}

export function removeJobsBadgeHooks(): void {
  jobHooks.off("job:created", refreshBadge);
  jobHooks.off("job:status-changed", refreshBadge);
  jobHooks.off("job:closed", refreshBadge);
  jobHooks.off("job:resolved", refreshBadge);
  jobHooks.off("job:reopened", refreshBadge);
  jobHooks.off("job:deleted", refreshBadge);
}
