/**
 * Publish live staff-console badges when @ursamu/web is present.
 *
 * `events:upcoming` — count of upcoming/active events from now.
 */

import { eventHooks } from "./hooks.ts";
import { countUpcomingEvents } from "./service.ts";

export const UPCOMING_KEY = "events:upcoming";
const UPCOMING_TITLE = "Upcoming events";

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

/** Recompute and push events:upcoming. */
export async function publishEventsUpcomingBadge(): Promise<void> {
  const mod = await loadWebBadges();
  if (typeof mod?.setStaffBadge !== "function") return;
  const n = await countUpcomingEvents();
  mod.setStaffBadge(UPCOMING_KEY, n, UPCOMING_TITLE);
}

const refreshBadge = (): void => {
  void publishEventsUpcomingBadge();
};

/** Subscribe lifecycle hooks so the badge stays fresh. */
export function registerEventsBadgeHooks(): void {
  eventHooks.on("event:created", refreshBadge);
  eventHooks.on("event:updated", refreshBadge);
  eventHooks.on("event:cancelled", refreshBadge);
  eventHooks.on("event:completed", refreshBadge);
  eventHooks.on("event:deleted", refreshBadge);
}

export function removeEventsBadgeHooks(): void {
  eventHooks.off("event:created", refreshBadge);
  eventHooks.off("event:updated", refreshBadge);
  eventHooks.off("event:cancelled", refreshBadge);
  eventHooks.off("event:completed", refreshBadge);
  eventHooks.off("event:deleted", refreshBadge);
}
