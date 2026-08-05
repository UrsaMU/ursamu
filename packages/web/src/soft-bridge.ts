/**
 * Soft peer helpers for plugins that optionally depend on @ursamu/web.
 *
 * Prefer these over copy-pasted try/import blocks in each plugin.
 *
 *   import {
 *     softRegisterStaffPage,
 *     softUnregisterStaffPage,
 *   } from "jsr:@ursamu/web";
 *
 * When this package *is* @ursamu/web, calls are direct (no re-import).
 */

import {
  registerStaffPage,
  unregisterStaffPage,
  type StaffPage,
} from "./staff-pages.ts";
import {
  registerStaffSideNav,
  unregisterStaffSideNav,
  type StaffSideNavRegistration,
} from "./staff-sidenav.ts";
import {
  registerStaffStatic,
  unregisterStaffStatic,
  type StaffStaticRegistration,
} from "./staff-static.ts";
import { registerStaffNav, unregisterStaffNav } from "./staff-nav.ts";
import type { StaffNavItem } from "./staff-nav.ts";

/** Always true when imported from @ursamu/web itself. */
export async function hasStaffConsole(): Promise<boolean> {
  return true;
}

export async function softRegisterStaffPage(
  page: StaffPage,
): Promise<boolean> {
  try {
    registerStaffPage(page);
    return true;
  } catch {
    return false;
  }
}

export async function softUnregisterStaffPage(
  id: string,
): Promise<boolean> {
  try {
    unregisterStaffPage(id);
    return true;
  } catch {
    return false;
  }
}

export async function softRegisterStaffNav(
  item: StaffNavItem,
): Promise<boolean> {
  try {
    registerStaffNav(item);
    return true;
  } catch {
    return false;
  }
}

export async function softUnregisterStaffNav(
  id: string,
): Promise<boolean> {
  try {
    unregisterStaffNav(id);
    return true;
  } catch {
    return false;
  }
}

export async function softRegisterStaffSideNav(
  reg: StaffSideNavRegistration,
): Promise<boolean> {
  try {
    registerStaffSideNav(reg);
    return true;
  } catch {
    return false;
  }
}

export async function softUnregisterStaffSideNav(
  pageId: string,
): Promise<boolean> {
  try {
    unregisterStaffSideNav(pageId);
    return true;
  } catch {
    return false;
  }
}

export async function softRegisterStaffStatic(
  reg: StaffStaticRegistration,
): Promise<boolean> {
  try {
    return registerStaffStatic(reg);
  } catch {
    return false;
  }
}

export async function softUnregisterStaffStatic(
  id: string,
): Promise<boolean> {
  try {
    unregisterStaffStatic(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Soft-load helper for *other* packages that must not hard-depend
 * on @ursamu/web. Uses a variable specifier so bundlers/JSR stay soft.
 */
export async function loadWebApi(): Promise<{
  registerStaffPage?: typeof registerStaffPage;
  unregisterStaffPage?: typeof unregisterStaffPage;
  registerStaffNav?: typeof registerStaffNav;
  unregisterStaffNav?: typeof unregisterStaffNav;
  registerStaffSideNav?: typeof registerStaffSideNav;
  unregisterStaffSideNav?: typeof unregisterStaffSideNav;
  registerStaffStatic?: typeof registerStaffStatic;
  unregisterStaffStatic?: typeof unregisterStaffStatic;
  softRegisterStaffPage?: typeof softRegisterStaffPage;
  softUnregisterStaffPage?: typeof softUnregisterStaffPage;
} | null> {
  try {
    const spec = "@ursamu/web";
    return await import(spec);
  } catch {
    return null;
  }
}
