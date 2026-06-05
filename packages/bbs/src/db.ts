import { DBO } from "@ursamu/mush";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IFlag {
  playerId: string;
  playerName: string;
  reason: string;
  createdAt: number;
}

export interface IReply {
  num: number;
  subject: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  editCount: number;
  icTag?: "ic" | "ooc";
}

export interface IPost {
  id: string;
  boardId: number;
  num: number;
  subject: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  timeout: number;
  editCount: number;
  replies: IReply[];
  sticky: boolean;
  icTag?: "ic" | "ooc";
  sceneId?: string;
  tags: string[];
  flags: IFlag[];
  /** Player IDs subscribed to reply notifications. Capped at 50. */
  watchers: string[];
}

export interface IBoard {
  id: string;
  num: number;
  title: string;
  timeout: number;
  anonymous: boolean;
  readLock: string;
  writeLock: string;
  pendingDelete: boolean;
  /** Display grouping header in +bblist. Defaults to "General". */
  category: string;
  /** Archive boards are read-only; expiring posts migrate here. */
  type: "normal" | "archive";
  /** Faction object ID — if set, locks resolve against its contents. */
  ownerId?: string;
  /** Player IDs with board-moderator privileges. */
  moderators: string[];
  /** Discord-compatible webhook URL for new-post notifications. */
  webhookUrl?: string;
  /** Board ID to move expired posts to instead of deleting them. */
  archiveTo?: string;
}

export interface IBBConfig {
  id: string;
  timeout: number;
  autoTimeout: boolean;
}

export interface IDraft {
  boardNum: number;
  subject: string;
  body: string;
  replyToPost?: number;
  editingPost?: number;
  icTag?: "ic" | "ooc";
  tags?: string[];
}

export interface ISeedBoardOptions {
  readLock?: string;
  writeLock?: string;
  timeout?: number;
  anonymous?: boolean;
  category?: string;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export const boards: DBO<IBoard> = new DBO<IBoard>("server.bboards");
export const posts: DBO<IPost> = new DBO<IPost>("server.bboard_posts");

// ---------------------------------------------------------------------------
// Counter helpers (derived from existing data — no external counters dep)
// ---------------------------------------------------------------------------

export async function getNextBoardNum(): Promise<number> {
  const all = await boards.query({});
  const nums = all.filter((b) => b.id !== "bbconfig").map((b) => b.num);
  return nums.length === 0 ? 1 : Math.max(...nums) + 1;
}

export async function getNextPostNum(boardNum: number): Promise<number> {
  const boardPosts = await posts.query({ boardId: boardNum });
  if (boardPosts.length === 0) return 1;
  return Math.max(...boardPosts.map((p) => p.num)) + 1;
}

// ---------------------------------------------------------------------------
// seedBoards — idempotent board creation for plugin init
// ---------------------------------------------------------------------------

/**
 * Idempotently create BBS boards by name or options object.
 * Boards that already exist (matched by title) are left unchanged.
 *
 * @example
 * await seedBoards(["OOC", "Announcements"]);
 * await seedBoards([{ name: "Staff", readLock: "wizard+", writeLock: "wizard+" }]);
 */
export async function seedBoards(
  entries: (string | (ISeedBoardOptions & { name: string }))[],
): Promise<void> {
  for (const entry of entries) {
    const name = typeof entry === "string" ? entry : entry.name;
    const opts: ISeedBoardOptions = typeof entry === "string" ? {} : entry;
    const existing = await boards.query({ title: name });
    if (existing.length !== 0) continue;
    const num = await getNextBoardNum();
    await boards.create({
      id: `board-${num}`,
      num,
      title: name,
      timeout: opts.timeout ?? 0,
      anonymous: opts.anonymous ?? false,
      readLock: opts.readLock ?? "all()",
      writeLock: opts.writeLock ?? "all()",
      pendingDelete: false,
      category: opts.category ?? "General",
      type: "normal",
      moderators: [],
    });
  }
}
