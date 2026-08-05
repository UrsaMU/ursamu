/**
 * Soft-register Jobs in the staff console when @ursamu/web is present.
 * In-console only (`route: "jobs"`).
 */

import {
  JOBS_DESCRIPTION,
  JOBS_PLUGIN_ID,
  JOBS_TITLE,
} from "./version.ts";

const PAGE = {
  id: JOBS_PLUGIN_ID,
  label: JOBS_TITLE,
  description: JOBS_DESCRIPTION,
  route: "jobs",
  order: 40,
  badgeKey: "jobs:open",
  badgeTitle: "Open jobs",
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

export async function registerJobsStaffNav(): Promise<void> {
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

export async function unregisterJobsStaffNav(): Promise<void> {
  const mod = await web();
  if (!mod) return;
  if (typeof mod.softUnregisterStaffPage === "function") {
    await mod.softUnregisterStaffPage(JOBS_PLUGIN_ID);
    return;
  }
  if (typeof mod.unregisterStaffPage === "function") {
    mod.unregisterStaffPage(JOBS_PLUGIN_ID);
    return;
  }
  mod.unregisterStaffNav?.(JOBS_PLUGIN_ID);
}
