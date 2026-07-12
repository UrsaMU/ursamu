/**
 * Default boards created on first install (engine:ready).
 * Idempotent — existing titles are left unchanged.
 *
 * Lock notes (see permissions.ts):
 *   "all()"   — open to all connected players
 *   "admin+"  — non-staff denied; staff always bypass
 *   "faction" — faction membership via board.ownerId
 */
import { seedBoards } from "./db.ts";
import type { ISeedBoardOptions } from "./db.ts";

export type IDefaultBoard = ISeedBoardOptions & { name: string };

/** Boards seeded when the BBS plugin first becomes ready. */
export const DEFAULT_BOARDS: readonly IDefaultBoard[] = [
  {
    name: "Announcements",
    category: "Public",
    // Players may read; only staff may post.
    readLock: "all()",
    writeLock: "admin+",
  },
  {
    name: "OOC",
    category: "Public",
    readLock: "all()",
    writeLock: "all()",
  },
  {
    name: "Jobs",
    category: "Staff",
    // Staff-only board; job lifecycle events land here.
    readLock: "admin+",
    writeLock: "admin+",
  },
];

/** Idempotently create the default board set. */
export async function seedDefaultBoards(): Promise<void> {
  await seedBoards([...DEFAULT_BOARDS]);
}
