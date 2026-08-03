/**
 * Soft-register Wiki in the staff console when @ursamu/web is present.
 * In-console only (`route: "wiki"`).
 */

import {
  WIKI_DESCRIPTION,
  WIKI_PLUGIN_ID,
  WIKI_TITLE,
} from "./version.ts";

const PAGE = {
  id: WIKI_PLUGIN_ID,
  label: WIKI_TITLE,
  description: WIKI_DESCRIPTION,
  route: "wiki",
  order: 20,
  badgeKey: "wiki:drafts",
  badgeTitle: "Drafts",
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

export async function registerWikiStaffNav(): Promise<void> {
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

export async function unregisterWikiStaffNav(): Promise<void> {
  const mod = await web();
  if (!mod) return;
  if (typeof mod.softUnregisterStaffPage === "function") {
    await mod.softUnregisterStaffPage(WIKI_PLUGIN_ID);
    return;
  }
  if (typeof mod.unregisterStaffPage === "function") {
    mod.unregisterStaffPage(WIKI_PLUGIN_ID);
    return;
  }
  mod.unregisterStaffNav?.(WIKI_PLUGIN_ID);
}
