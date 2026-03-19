import type { IPlugin } from "../../@types/IPlugin.ts";
import { registerPluginRoute } from "../../app.ts";
import { bboardsRouteHandler } from "./router.ts";
import "./commands.ts";
import { boards, getNextBoardId } from "./db.ts";

const DEFAULT_BOARDS = [
  "POP: Announcements",
  "POP: Rules/Policy",
  "POP: Code / Wiki",
  "POP: OOC",
  "General: Recruitment",
  "General: IC News",
  "General: IC Advertisements",
  "General: Introductions",
  "General: Plots / PRPs",
  "Vampire: IC Events",
  "Vampire: Director's Desk",
  "Vampire: Introductions",
  "Vampire: Plot / PRPs",
];

const bboardsPlugin: IPlugin = {
  name: "bboards",
  version: "2.0.0",
  description: "Myrddin-style BBS — +bbread, +bbpost, +bbreply, drafts, signatures, threading, read tracking",

  init: async () => {
    registerPluginRoute("/api/v1/boards", bboardsRouteHandler);

    // Create default boards if none exist
    const existing = await boards.find({});
    if (existing.length === 0) {
      for (const title of DEFAULT_BOARDS) {
        const num = await getNextBoardId();
        await boards.create({
          id: `board-${num}`,
          num,
          title,
          timeout: 0,
          anonymous: false,
          readLock: "all()",
          writeLock: "all()",
          pendingDelete: false,
        });
      }
      console.log(`[bboards] Created ${DEFAULT_BOARDS.length} default boards.`);
    }

    console.log("[bboards] Plugin initialized — +bb commands active, /api/v1/boards routes registered");
    return true;
  },

  remove: () => {
    console.log("[bboards] Plugin removed");
  },
};

export default bboardsPlugin;
