// ─── Events plugin entry point ────────────────────────────────────────────────

import "./commands.ts";
import { registerPluginRoute } from "@ursamu/mush";
import { registerHelpDir } from "@ursamu/help/register";
import type { IPlugin } from "@ursamu/mush";
import { eventsRouteHandler } from "./router.ts";
import {
  EVENTS_DESCRIPTION,
  EVENTS_PLUGIN_ID,
  EVENTS_TITLE,
  EVENTS_VERSION,
} from "./version.ts";
import {
  registerEventsStaffNav,
  unregisterEventsStaffNav,
} from "./staff-nav-bridge.ts";
import {
  publishEventsUpcomingBadge,
  registerEventsBadgeHooks,
  removeEventsBadgeHooks,
} from "./staff-badge-bridge.ts";
import {
  registerSceneBridge,
  removeSceneBridge,
} from "./scene-bridge.ts";

/**
 * UrsaMU Events Plugin — in-game calendar with RSVP and REST.
 *
 * Registers +event / +events commands and `/api/v1/events` routes.
 * Subscribe to lifecycle hooks from other plugins:
 * ```ts
 * import { eventHooks } from "@ursamu/events";
 * eventHooks.on("event:created", (ev) => console.log(ev.title));
 * ```
 */
const bootstrapStaffUi = async (): Promise<void> => {
  await registerEventsStaffNav();
  registerEventsBadgeHooks();
  await publishEventsUpcomingBadge();
};

const eventsPlugin: IPlugin = {
  name: EVENTS_PLUGIN_ID,
  version: EVENTS_VERSION,
  description: `${EVENTS_TITLE} — ${EVENTS_DESCRIPTION}`,
  dependencies: [
    { name: "help", version: ">=1.0.0" },
  ],

  init: () => {
    registerPluginRoute("/api/v1/events", eventsRouteHandler);
    registerHelpDir(
      new URL("../help", import.meta.url),
      EVENTS_PLUGIN_ID,
    );
    registerSceneBridge();

    // Fire-and-forget — soft-peer @ursamu/web may be absent.
    void bootstrapStaffUi();

    console.log(
      `[${EVENTS_PLUGIN_ID}] ${EVENTS_TITLE} v${EVENTS_VERSION} — ` +
        `+event/+events, /api/v1/events; staff UI via @ursamu/web /admin/events`,
    );
    return true;
  },

  remove: () => {
    removeEventsBadgeHooks();
    removeSceneBridge();
    void unregisterEventsStaffNav();
    console.log(`[${EVENTS_PLUGIN_ID}] Plugin removed.`);
  },
};

export default eventsPlugin;
