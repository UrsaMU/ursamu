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

/**
 * Idempotently create BBS boards by name. Boards that already exist (matched
 * by title) are left unchanged. Call this from your plugin's `init()` to seed
 * default boards on first startup.
 *
 * @example
 * ```ts
 * await seedBoards(["Character Generation", "Plotlines", "Requests", "XP"]);
 * ```
 */
export async function seedBoards(names: string[]): Promise<void> {
  for (const name of names) {
    const existing = await boards.query({ title: name });
    if (existing.length === 0) {
      const num = await getNextBoardId();
      await boards.create({
        id: `board-${num}`,
        num,
        title: name,
        timeout: 0,
        anonymous: false,
        readLock: "connected",
        writeLock: "connected",
        pendingDelete: false,
      });
    }
  }
}
