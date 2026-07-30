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
  setStaffBadge,
  clearStaffBadge,
  getStaffBadge,
  listStaffBadges,
  clearAllStaffBadges,
  setStaffBadgePusher,
} from "./src/staff-badges.ts";
export type { StaffBadge } from "./src/staff-badges.ts";
