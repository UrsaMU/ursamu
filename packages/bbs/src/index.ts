import type { IPlugin } from "@ursamu/mush";
import { registerPluginRoute } from "@ursamu/mush";
import { registerHelpDir } from "@ursamu/help/register";
import { bboardsRouteHandler } from "./router.ts";
import { bbsAdminStaticHandler } from "./static.ts";
import { startCleanupInterval, stopCleanupInterval } from "./cleanup.ts";
import { seedDefaultBoards } from "./seed.ts";
import { registerJobBridge, removeJobBridge } from "./job-bridge.ts";
import "./commands/reading.ts";
import "./commands/posting.ts";
import "./commands/social.ts";
import "./commands/management.ts";
import "./commands/staff.ts";
import "./commands/compat.ts";
import {
  BBS_DESCRIPTION,
  BBS_PLUGIN_ID,
  BBS_TITLE,
  BBS_VERSION,
} from "./version.ts";
import {
  hasStaffConsole,
  registerBbsStaffNav,
  unregisterBbsStaffNav,
} from "./staff-nav-bridge.ts";
import { publishBbsFlaggedBadge } from "./staff-badge-bridge.ts";

/**
 * Seed boards + wire job bridge. Runs from init() so we do not
 * depend on engine:ready (STARTUP attrs can hang and never fire it).
 */
const bootstrapBoards = async (): Promise<void> => {
  try {
    await seedDefaultBoards();
    console.log(
      "[bbs] Default boards seeded " +
        "(Announcements, OOC, Jobs).",
    );
  } catch (e: unknown) {
    console.error("[bbs] seedDefaultBoards failed:", e);
  }
  await registerJobBridge();
  await registerBbsStaffNav();
  await publishBbsFlaggedBadge();

  // Package SPA only if host console is missing — never compete
  // with @ursamu/web /admin/bbs (AppLayout + BbsView).
  if (!(await hasStaffConsole())) {
    registerPluginRoute(
      "/admin/bbs-app",
      bbsAdminStaticHandler,
    );
    console.log(
      "[bbs] No @ursamu/web — fallback SPA at /admin/bbs-app/",
    );
  }
};

const plugin: IPlugin = {
  name: BBS_PLUGIN_ID,
  version: BBS_VERSION,
  description: `${BBS_TITLE} — ${BBS_DESCRIPTION}`,

  init: () => {
    registerHelpDir(
      new URL("../help", import.meta.url),
      BBS_PLUGIN_ID,
    );
    registerPluginRoute("/api/v1/boards", bboardsRouteHandler);
    startCleanupInterval();
    // Fire-and-forget — init must stay sync-friendly for the loader.
    void bootstrapBoards();
    console.log(
      `[${BBS_PLUGIN_ID}] ${BBS_TITLE} — +bb commands, ` +
        `/api/v1/boards; staff UI via @ursamu/web /admin/bbs`,
    );
    return true;
  },

  remove: () => {
    removeJobBridge();
    stopCleanupInterval();
    void unregisterBbsStaffNav();
    console.log("[bbs] Plugin removed.");
  },
};

export default plugin;
