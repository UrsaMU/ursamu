/**
 * Soft-register Events in the staff console when @ursamu/web is present.
 * In-console route: "events" → /admin/events.
 */

import {
  EVENTS_DESCRIPTION,
  EVENTS_PLUGIN_ID,
  EVENTS_TITLE,
} from "./version.ts";

const PAGE = {
  id: EVENTS_PLUGIN_ID,
  label: EVENTS_TITLE,
  description: EVENTS_DESCRIPTION,
  route: "events",
  order: 45,
  badgeKey: "events:upcoming",
  badgeTitle: "Upcoming events",
} as const;

async function web() {
  try {
    const spec = "@ursamu/web";
    return await import(spec) as {
      softRegisterStaffPage?: (
        p: typeof PAGE,
      ) => Promise<boolean>;
      softUnregisterStaffPage?: (id: string) => Promise<boolean>;
      registerStaffPage?: (p: typeof PAGE) => void;
      unregisterStaffPage?: (id: string) => void;
      registerStaffNav?: (p: typeof PAGE) => void;
      unregisterStaffNav?: (id: string) => void;
    };
  } catch {
    return null;
  }
}

export async function hasStaffConsole(): Promise<boolean> {
  const mod = await web();
  return !!(
    mod?.softRegisterStaffPage ||
    mod?.registerStaffPage ||
    mod?.registerStaffNav
  );
}

export async function registerEventsStaffNav(): Promise<void> {
  const mod = await web();
  if (!mod) return;
  if (typeof mod.softRegisterStaffPage === "function") {
    await mod.softRegisterStaffPage({ ...PAGE });
    return;
  }
  if (typeof mod.registerStaffPage === "function") {
    mod.registerStaffPage({ ...PAGE });
    return;
  }
  mod.registerStaffNav?.({ ...PAGE });
}

export async function unregisterEventsStaffNav(): Promise<void> {
  const mod = await web();
  if (!mod) return;
  if (typeof mod.softUnregisterStaffPage === "function") {
    await mod.softUnregisterStaffPage(EVENTS_PLUGIN_ID);
    return;
  }
  if (typeof mod.unregisterStaffPage === "function") {
    mod.unregisterStaffPage(EVENTS_PLUGIN_ID);
    return;
  }
  mod.unregisterStaffNav?.(EVENTS_PLUGIN_ID);
}
