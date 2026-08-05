/**
 * Publish live staff-console badges when @ursamu/web is present.
 *
 * `wiki:drafts` — count of draft pages (staff-only).
 * Host also falls back to live store; plugin push stays in sync
 * after REST/in-game mutations.
 */

import { resolve } from "@std/path";
import {
  readPageFile,
  walkWiki,
  WIKI_DIR,
} from "./fs.ts";
import { wikiHooks } from "./hooks.ts";

export const DRAFTS_KEY = "wiki:drafts";
const DRAFTS_TITLE = "Drafts";

type BadgeApi = {
  setStaffBadge?: (
    key: string,
    count: number | string,
    title?: string,
  ) => void;
};

async function loadWebBadges(): Promise<BadgeApi | null> {
  try {
    const spec = "@ursamu/web";
    const mod = await import(spec) as BadgeApi;
    return mod;
  } catch {
    return null;
  }
}

/** Count draft pages for the staff badge. */
export async function countDraftPages(): Promise<number> {
  try {
    let n = 0;
    const root = resolve(WIKI_DIR);
    for await (const { absPath } of walkWiki(root)) {
      const page = await readPageFile(absPath);
      if (page?.meta?.draft === true) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

/** Recompute and push wiki:drafts. */
export async function publishWikiDraftsBadge(): Promise<void> {
  const mod = await loadWebBadges();
  if (typeof mod?.setStaffBadge !== "function") return;
  const n = await countDraftPages();
  mod.setStaffBadge(DRAFTS_KEY, n, DRAFTS_TITLE);
}

const refreshBadge = (): void => {
  void publishWikiDraftsBadge();
};

/** Subscribe lifecycle hooks so the badge stays fresh. */
export function registerWikiBadgeHooks(): void {
  wikiHooks.on("wiki:created", refreshBadge);
  wikiHooks.on("wiki:edited", refreshBadge);
  wikiHooks.on("wiki:deleted", refreshBadge);
  wikiHooks.on("wiki:renamed", refreshBadge);
}

export function removeWikiBadgeHooks(): void {
  wikiHooks.off("wiki:created", refreshBadge);
  wikiHooks.off("wiki:edited", refreshBadge);
  wikiHooks.off("wiki:deleted", refreshBadge);
  wikiHooks.off("wiki:renamed", refreshBadge);
}
