import type { IPlugin } from "@ursamu/mush";
import { registerPluginRoute } from "@ursamu/mush";
import { bboardsRouteHandler } from "./router.ts";
import { startCleanupInterval } from "./cleanup.ts";
import "./commands/reading.ts";
import "./commands/posting.ts";
import "./commands/social.ts";
import "./commands/management.ts";
import "./commands/staff.ts";

const plugin: IPlugin = {
  name: "bbs",
  version: "0.1.0",
  description:
    "Full-featured BBS — boards, threading, categories, IC/OOC tags, sticky posts, board moderators, post flagging, reply watching, Discord webhooks, scene linking, and archive boards.",

  init: () => {
    registerPluginRoute("/api/v1/boards", bboardsRouteHandler);
    startCleanupInterval();
    console.log("[bbs] Plugin initialized — +bb commands active, /api/v1/boards registered.");
    return true;
  },

  remove: () => {
    console.log("[bbs] Plugin removed.");
  },
};

export default plugin;
