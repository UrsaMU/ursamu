/**
 * Soft-register Jobs in the staff console topbar when
 * @ursamu/web is present. Nav is **in-console only**
 * (`route: "jobs"` → /admin/jobs inside AppLayout).
 */

import {
  JOBS_DESCRIPTION,
  JOBS_PLUGIN_ID,
  JOBS_TITLE,
} from "./version.ts";

/** In-console vue-router name — lives under AppLayout. */
const NAV = {
  id: JOBS_PLUGIN_ID,
  label: JOBS_TITLE,
  description: JOBS_DESCRIPTION,
  route: "jobs",
  order: 40,
  badgeKey: "jobs:open",
  badgeTitle: "Open jobs",
} as const;

type NavApi = {
  registerStaffNav?: (item: {
    id: string;
    label: string;
    description?: string;
    href?: string;
    route?: string;
    order?: number;
    badgeKey?: string;
    badgeTitle?: string;
  }) => void;
  unregisterStaffNav?: (id: string) => void;
};

async function loadWebNav(): Promise<NavApi | null> {
  try {
    // Variable specifier — soft peer; must not force JSR dep.
    const spec = "@ursamu/web";
    const mod = await import(spec) as NavApi;
    return mod;
  } catch {
    return null;
  }
}

/** True when @ursamu/web is loadable (in-console UI available). */
export async function hasStaffConsole(): Promise<boolean> {
  const mod = await loadWebNav();
  return typeof mod?.registerStaffNav === "function";
}

export async function registerJobsStaffNav(): Promise<void> {
  const mod = await loadWebNav();
  if (typeof mod?.registerStaffNav === "function") {
    mod.registerStaffNav({ ...NAV });
  }
}

export async function unregisterJobsStaffNav(): Promise<void> {
  const mod = await loadWebNav();
  if (typeof mod?.unregisterStaffNav === "function") {
    mod.unregisterStaffNav(JOBS_PLUGIN_ID);
  }
}
