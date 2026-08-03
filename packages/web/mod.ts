/**
 * @module @ursamu/web
 *
 * Staff web console for UrsaMU (wiki, database browser, …).
 */

export { plugin as default } from "./src/index.ts";
export {
  resolveAdminFile,
  adminStaticHandler,
} from "./src/static.ts";
export {
  startAdminWs,
  stopAdminWs,
  broadcastAdmin,
  adminClientCount,
  resolveStaffUserId,
} from "./src/admin-ws.ts";
export {
  registerStaffNav,
  unregisterStaffNav,
  listStaffNav,
  clearStaffNav,
} from "./src/staff-nav.ts";
export type { StaffNavItem } from "./src/staff-nav.ts";
export {
  registerStaffPage,
  unregisterStaffPage,
  listStaffPages,
  getStaffPage,
  clearStaffPages,
} from "./src/staff-pages.ts";
export type { StaffPage } from "./src/staff-pages.ts";
export {
  registerStaffStatic,
  unregisterStaffStatic,
  listStaffStatic,
  clearStaffStatic,
  isStaffStaticId,
  getStaffStaticRoot,
} from "./src/staff-static.ts";
export type { StaffStaticRegistration } from "./src/staff-static.ts";
export {
  setStaffBadge,
  clearStaffBadge,
  getStaffBadge,
  listStaffBadges,
  clearAllStaffBadges,
  setStaffBadgePusher,
} from "./src/staff-badges.ts";
export type { StaffBadge } from "./src/staff-badges.ts";
export {
  registerStaffSideNav,
  unregisterStaffSideNav,
  getStaffSideNav,
  listStaffSideNav,
  clearStaffSideNav,
} from "./src/staff-sidenav.ts";
export type {
  StaffSideNavItem,
  StaffSideNavGroup,
  StaffSideNavRegistration,
} from "./src/staff-sidenav.ts";
export {
  hasStaffConsole,
  softRegisterStaffPage,
  softUnregisterStaffPage,
  softRegisterStaffNav,
  softUnregisterStaffNav,
  softRegisterStaffSideNav,
  softUnregisterStaffSideNav,
  softRegisterStaffStatic,
  softUnregisterStaffStatic,
  loadWebApi,
} from "./src/soft-bridge.ts";
export {
  setStaffChromeNotifier,
  setStaffChromePusher,
  notifyStaffChrome,
  flushStaffChrome,
} from "./src/staff-chrome.ts";
export type { StaffChromeMsg } from "./src/staff-chrome.ts";
