import type { IPlugin, LayoutFn } from "@ursamu/mush";
import {
  registerPluginRoute,
  registerHeader,
  registerDivider,
  registerFooter,
  unregisterHeader,
  unregisterDivider,
  unregisterFooter,
} from "@ursamu/mush";
import { registerHelpDir } from "@ursamu/help-plugin";
import { bboardsRouteHandler } from "./router.ts";
import { startCleanupInterval, stopCleanupInterval } from "./cleanup.ts";
import { seedDefaultBoards } from "./seed.ts";
import { registerJobBridge, removeJobBridge } from "./job-bridge.ts";
import { header as bbsHeaderFn, divider as bbsDividerFn, footer as bbsFooterFn } from "./display.ts";
import "./commands/reading.ts";
import "./commands/posting.ts";
import "./commands/social.ts";
import "./commands/management.ts";
import "./commands/staff.ts";

// Same LayoutFn contract as cofd — red rule + bold yellow title.
const bbsHeader = bbsHeaderFn as LayoutFn;
const bbsDivider = bbsDividerFn as LayoutFn;
const bbsFooter = bbsFooterFn as LayoutFn;

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
    registerHeader(bbsHeader);
    registerDivider(bbsDivider);
    registerFooter(bbsFooter);
    startCleanupInterval();
    // Fire-and-forget — init must stay sync-friendly for the loader.
    void bootstrapBoards();
    console.log(
      "[bbs] Plugin initialized — +bb commands active, " +
        "/api/v1/boards registered, layout handlers registered.",
    );
    return true;
  },

  remove: () => {
    unregisterHeader(bbsHeader);
    unregisterDivider(bbsDivider);
    unregisterFooter(bbsFooter);
    removeJobBridge();
    stopCleanupInterval();
    console.log("[bbs] Plugin removed.");
  },
};

export default plugin;
