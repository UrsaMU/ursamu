/**
 * Price of Power — BBS default boards
 * Creates the game's bulletin boards on first run.
 */

import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import { boards, getNextBoardId } from "../../plugins/bboards/db.ts";

const DEFAULT_BOARDS = [
  "POP: Announcements",
  "POP: Rules/Policy",
  "POP: Code",
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

// Auto-create boards on first load if none exist
(async () => {
  try {
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
      console.log(`[POP] Created ${DEFAULT_BOARDS.length} default BBS boards.`);
    }
  } catch (e) {
    console.error("[POP] Failed to create default boards:", e);
  }
})();

// Staff command to re-seed boards if needed
export default () =>
  addCmd({
    name: "+bbseed",
    pattern: /^\+bbseed\s*$/i,
    lock: "connected & superuser",
    exec: async (u: IUrsamuSDK) => {
      const existing = await boards.find({});
      if (existing.length > 0) {
        u.send(`>BBS: ${existing.length} boards already exist. Delete them first if you want to re-seed.`);
        return;
      }

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
      u.send(`>BBS: Created ${DEFAULT_BOARDS.length} default boards.`);
    },
  });
