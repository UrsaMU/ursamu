/**
 * Soft-register BBS in the staff console topbar when @ursamu/web
 * is present. Labels come from plugin identity (version.ts) —
 * not hard-coded in the host UI.
 *
 * When web is installed, nav is **in-console only** (`route: "bbs"`
 * → /admin/bbs inside AppLayout). No href to the package SPA.
 */

import {
  BBS_DESCRIPTION,
  BBS_PLUGIN_ID,
  BBS_TITLE,
} from "./version.ts";

/** In-console vue-router name — lives under AppLayout. */
const NAV = {
  id: BBS_PLUGIN_ID,
  label: BBS_TITLE,
  description: BBS_DESCRIPTION,
  route: "bbs",
  order: 45,
  // Lit on new posts/replies (and flags); clear-on-view in host.
  badgeKey: "bbs:activity",
  badgeTitle: "New BBS activity",
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

export async function registerBbsStaffNav(): Promise<void> {
  const mod = await loadWebNav();
  if (typeof mod?.registerStaffNav === "function") {
    // route only — never send operators to /admin/bbs-app/
    mod.registerStaffNav({ ...NAV });
  }
}

export async function unregisterBbsStaffNav(): Promise<void> {
  const mod = await loadWebNav();
  if (typeof mod?.unregisterStaffNav === "function") {
    mod.unregisterStaffNav(BBS_PLUGIN_ID);
  }
}
