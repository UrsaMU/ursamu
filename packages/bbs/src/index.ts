import type { IPlugin } from "@ursamu/mush";
import { registerPluginRoute } from "@ursamu/mush";
import { registerHelpDir } from "@ursamu/help";
import { bboardsRouteHandler } from "./router.ts";
import { startCleanupInterval, stopCleanupInterval } from "./cleanup.ts";
import { seedDefaultBoards } from "./seed.ts";
import { registerJobBridge, removeJobBridge } from "./job-bridge.ts";
import "./commands/reading.ts";
import "./commands/posting.ts";
import "./commands/social.ts";
import "./commands/management.ts";
import "./commands/staff.ts";

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
};

const plugin: IPlugin = {
  name: "bbs",
  version: "0.1.0",
  description:
    "Full-featured BBS — boards, threading, categories, " +
    "IC/OOC tags, sticky posts, board moderators, post " +
    "flagging, reply watching, Discord webhooks, scene " +
    "linking, archive boards, and jobs-bridge.",

  init: () => {
    registerHelpDir(
      new URL("../help", import.meta.url).pathname,
      "bbs",
    );
    registerPluginRoute("/api/v1/boards", bboardsRouteHandler);
    startCleanupInterval();
    // Fire-and-forget — init must stay sync-friendly for the loader.
    void bootstrapBoards();
    console.log(
      "[bbs] Plugin initialized — +bb commands active, " +
        "/api/v1/boards registered " +
        "(layout via engine game.layout).",
    );
    return true;
  },

  remove: () => {
    removeJobBridge();
    stopCleanupInterval();
    console.log("[bbs] Plugin removed.");
  },
};

export default plugin;
