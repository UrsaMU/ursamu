/**
 * @ursamu/web — staff console plugin.
 *
 * Serves the multi-section admin SPA at /admin/ (legacy /admin/wiki/
 * still works). Live updates via WebSocket at /admin/ws.
 * Wiki content APIs stay on @ursamu/wiki.
 */

import { registerPluginRoute } from "@ursamu/mush";
import type { IPlugin } from "@ursamu/mush";
import { adminStaticHandler } from "./static.ts";
import { startAdminWs, stopAdminWs } from "./admin-ws.ts";
import { adminSettingsHandler } from "./settings-api.ts";

export const plugin: IPlugin = {
  name: "web",
  version: "0.2.60",
  description:
    "Staff web console (Vue 3) — WebSocket-first API + UI.",

  init: () => {
    registerPluginRoute("/admin", adminStaticHandler);
    // Legacy bookmark path
    registerPluginRoute("/admin/wiki", adminStaticHandler);
    // Settings / restart / plugin inventory (staff JWT)
    registerPluginRoute("/api/v1/admin", adminSettingsHandler);
    startAdminWs();
    console.log(
      "[web] Staff console at /admin/ — WS RPC + " +
        "/api/v1/admin settings. Build: deno task ui:build",
    );
    return true;
  },

  remove: () => {
    stopAdminWs();
  },
};

export default plugin;
