import { DBO } from "../../services/Database/database.ts";
import { counters } from "../../services/Database/index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IReply {
  num: number;
  subject: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  editCount: number;
}

export interface IPost {
  id: string;           // "bbpost-<globalId>"
  boardId: number;
  num: number;           // post number on this board (1, 2, 3...)
  globalId: number;
  subject: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  timeout: number;       // 0 = use board default
  editCount: number;
  replies: IReply[];
}

export interface IBoard {
  id: string;            // "board-<num>"
  num: number;
  title: string;
  timeout: number;       // default post timeout in days (0 = none)
  anonymous: boolean;
  readLock: string;      // lock expression
  writeLock: string;
  pendingDelete: boolean;
}

export interface IBBConfig {
  id: string;            // "bbconfig"
  timeout: number;       // global default timeout
  autoTimeout: boolean;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export const boards: DBO<IBoard> = new DBO<IBoard>("server.bboards");
export const posts: DBO<IPost> = new DBO<IPost>("server.bboard_posts");

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

export async function getNextBoardId(): Promise<number> {
  return await counters.atomicIncrement("bboard_id");
}

export async function getNextPostId(): Promise<number> {
  return await counters.atomicIncrement("bboard_post_id");
}

// ---------------------------------------------------------------------------
// Plugin utilities
// ---------------------------------------------------------------------------

/** Per-board options accepted by {@link seedBoards}. */
export interface ISeedBoardOptions {
  /**
   * Lock expression controlling who can read/see the board.
   * Defaults to `"all()"` (open to everyone who is connected).
   *
   * Common values: `"all()"`, `"connected"`, `"admin+"`, `"wizard+"`,
   * or any engine lock expression.
   */
  readLock?: string;
  /**
   * Lock expression controlling who can post to the board.
   * Defaults to `"all()"`.
   */
  writeLock?: string;
  /** Post expiry in days. `0` means no timeout (default). */
  timeout?: number;
  /** When `true`, author names are hidden on posts. Defaults to `false`. */
  anonymous?: boolean;
}

/**
 * Idempotently create BBS boards by name. Boards that already exist (matched
 * by title) are left unchanged. Call this from your plugin's `init()` to seed
 * default boards on first startup.
 *
 * Lock expressions follow the engine's lock syntax. Omitting `readLock` /
 * `writeLock` opens the board to all connected players (matching
 * `+bbnewboard` defaults). Pass a lock string to restrict access.
 *
 * @example
 * ```ts
 * // Open boards
 * await seedBoards(["OOC", "Announcements"]);
 *
 * // Staff-only board
 * await seedBoards([{ name: "Staff", readLock: "wizard+", writeLock: "wizard+" }]);
 *
 * // Mix of plain names and options objects
 * await seedBoards([
 *   "OOC",
 *   { name: "Character Generation", writeLock: "admin+" },
 *   { name: "Requests", readLock: "connected", writeLock: "connected" },
 * ]);
 * ```
 */
export async function seedBoards(
  entries: (string | (ISeedBoardOptions & { name: string }))[],
): Promise<void> {
  for (const entry of entries) {
    const name = typeof entry === "string" ? entry : entry.name;
    const opts: ISeedBoardOptions = typeof entry === "string" ? {} : entry;

    const existing = await boards.query({ title: name });
    if (existing.length === 0) {
      const num = await getNextBoardId();
      await boards.create({
        id: `board-${num}`,
        num,
        title: name,
        timeout: opts.timeout ?? 0,
        anonymous: opts.anonymous ?? false,
        readLock: opts.readLock ?? "all()",
        writeLock: opts.writeLock ?? "all()",
        pendingDelete: false,
      });
    }
  }
}
