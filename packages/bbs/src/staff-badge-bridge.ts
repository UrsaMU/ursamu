/**
 * Publish live staff-console badges when @ursamu/web is present.
 *
 * `bbs:activity` — monotonic counter bumped on new posts, replies,
 * and flag changes. Clear-on-view in the host compares the value;
 * any bump after ack lights the red pill again.
 *
 * `bbs:flagged` — still published for tools that listen; nav uses
 * activity so ordinary board traffic is visible to staff.
 */

import { posts } from "./db.ts";

/** Nav badge (posts + replies + flags). */
export const ACTIVITY_KEY = "bbs:activity";
const ACTIVITY_TITLE = "New BBS activity";

/** Secondary key for flagged-only tooling. */
export const FLAG_KEY = "bbs:flagged";
const FLAG_TITLE = "Flagged posts";

type BadgeApi = {
  setStaffBadge?: (
    key: string,
    count: number | string,
    title?: string,
  ) => void;
};

/** In-process sequence — resets on restart (fine: badge is attention). */
let activitySeq = 0;

async function loadWebBadges(): Promise<BadgeApi | null> {
  try {
    // Variable specifier — soft peer; must not force JSR dep on web.
    const spec = "@ursamu/web";
    const mod = await import(spec) as BadgeApi;
    return mod;
  } catch {
    return null;
  }
}

/** Count posts that have at least one flag. */
export async function countFlaggedPosts(): Promise<number> {
  try {
    const all = await posts.query({});
    let n = 0;
    for (const p of all) {
      if ((p.flags?.length ?? 0) > 0) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

/** Recompute and push bbs:flagged. */
export async function publishBbsFlaggedBadge(): Promise<void> {
  const mod = await loadWebBadges();
  if (typeof mod?.setStaffBadge !== "function") return;
  const n = await countFlaggedPosts();
  mod.setStaffBadge(FLAG_KEY, n, FLAG_TITLE);
}

/**
 * Bump staff attention badge (new post, reply, or flag change).
 * Safe to call fire-and-forget.
 */
export async function bumpBbsActivityBadge(): Promise<void> {
  activitySeq += 1;
  const mod = await loadWebBadges();
  if (typeof mod?.setStaffBadge !== "function") return;
  mod.setStaffBadge(ACTIVITY_KEY, activitySeq, ACTIVITY_TITLE);
}

/** Flag change: refresh flagged count and bump activity. */
export async function publishBbsFlaggedBadgeAndBump(): Promise<void> {
  await publishBbsFlaggedBadge();
  await bumpBbsActivityBadge();
}
