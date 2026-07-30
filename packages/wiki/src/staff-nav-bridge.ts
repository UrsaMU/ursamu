/**
 * Soft-register Wiki in the staff console topbar when
 * @ursamu/web is present. Nav is **in-console only**
 * (`route: "wiki"` → /admin/wiki inside AppLayout).
 */

import {
  WIKI_DESCRIPTION,
  WIKI_PLUGIN_ID,
  WIKI_TITLE,
} from "./version.ts";

/** In-console vue-router name — lives under AppLayout. */
const NAV = {
  id: WIKI_PLUGIN_ID,
  label: WIKI_TITLE,
  description: WIKI_DESCRIPTION,
  route: "wiki",
  order: 20,
  badgeKey: "wiki:drafts",
  badgeTitle: "Drafts",
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

export async function registerWikiStaffNav(): Promise<void> {
  const mod = await loadWebNav();
  if (typeof mod?.registerStaffNav === "function") {
    mod.registerStaffNav({ ...NAV });
  }
}

export async function unregisterWikiStaffNav(): Promise<void> {
  const mod = await loadWebNav();
  if (typeof mod?.unregisterStaffNav === "function") {
    mod.unregisterStaffNav(WIKI_PLUGIN_ID);
  }
}
