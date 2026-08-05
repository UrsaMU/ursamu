/**
 * Soft-register BBS in the staff console when @ursamu/web is present.
 * In-console only (`route: "bbs"`).
 */

import {
  BBS_DESCRIPTION,
  BBS_PLUGIN_ID,
  BBS_TITLE,
} from "./version.ts";

const PAGE = {
  id: BBS_PLUGIN_ID,
  label: BBS_TITLE,
  description: BBS_DESCRIPTION,
  route: "bbs",
  order: 45,
  badgeKey: "bbs:activity",
  badgeTitle: "New BBS activity",
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

/** True when @ursamu/web is loadable. */
export async function hasStaffConsole(): Promise<boolean> {
  const mod = await web();
  return !!(
    mod?.softRegisterStaffPage ||
    mod?.registerStaffPage ||
    mod?.registerStaffNav
  );
}

export async function registerBbsStaffNav(): Promise<void> {
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

export async function unregisterBbsStaffNav(): Promise<void> {
  const mod = await web();
  if (!mod) return;
  if (typeof mod.softUnregisterStaffPage === "function") {
    await mod.softUnregisterStaffPage(BBS_PLUGIN_ID);
    return;
  }
  if (typeof mod.unregisterStaffPage === "function") {
    mod.unregisterStaffPage(BBS_PLUGIN_ID);
    return;
  }
  mod.unregisterStaffNav?.(BBS_PLUGIN_ID);
}
