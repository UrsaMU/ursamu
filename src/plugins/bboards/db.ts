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
