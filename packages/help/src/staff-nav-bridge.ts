/**
 * Soft-register Help in staff console
 * (`route: "help"` → /admin/help).
 */

import {
  HELP_DESCRIPTION,
  HELP_PLUGIN_ID,
  HELP_TITLE,
} from "./version.ts";

const NAV = {
  id: HELP_PLUGIN_ID,
  label: HELP_TITLE,
  description: HELP_DESCRIPTION,
  route: "help",
  order: 85,
} as const;

type NavApi = {
  registerStaffNav?: (item: typeof NAV) => void;
  unregisterStaffNav?: (id: string) => void;
};

async function loadWebNav(): Promise<NavApi | null> {
  try {
    const spec = "@ursamu/web";
    return await import(spec) as NavApi;
  } catch {
    return null;
  }
}

export async function registerHelpStaffNav(): Promise<void> {
  const mod = await loadWebNav();
  if (typeof mod?.registerStaffNav !== "function") {
    console.log(
      "[help] @ursamu/web not available — staff nav skipped",
    );
    return;
  }
  mod.registerStaffNav({ ...NAV });
  console.log(
    `[help] Staff nav registered → /admin/${NAV.route}`,
  );
}

export async function unregisterHelpStaffNav(): Promise<void> {
  const mod = await loadWebNav();
  if (typeof mod?.unregisterStaffNav === "function") {
    mod.unregisterStaffNav(HELP_PLUGIN_ID);
  }
}
