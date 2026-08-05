/**
 * Soft hooks for staff console live updates.
 * When @ursamu/web is present it can subscribe; otherwise no-ops.
 */

import type { IBoard, IPost } from "./db.ts";

export type BbsBoardEvent = {
  board: IBoard;
  at: number;
};

export type BbsBoardDeleteEvent = {
  id: string;
  num?: number;
  at: number;
};

export type BbsPostEvent = {
  boardId: string;
  boardNum: number;
  post: IPost;
  at: number;
};

type Handler<T> = (e: T) => void | Promise<void>;

const boardUpsert = new Set<Handler<BbsBoardEvent>>();
const boardDelete = new Set<Handler<BbsBoardDeleteEvent>>();
const postUpsert = new Set<Handler<BbsPostEvent>>();

export function onBbsBoardUpsert(h: Handler<BbsBoardEvent>): void {
  boardUpsert.add(h);
}
export function offBbsBoardUpsert(h: Handler<BbsBoardEvent>): void {
  boardUpsert.delete(h);
}
export function onBbsBoardDelete(
  h: Handler<BbsBoardDeleteEvent>,
): void {
  boardDelete.add(h);
}
export function offBbsBoardDelete(
  h: Handler<BbsBoardDeleteEvent>,
): void {
  boardDelete.delete(h);
}
export function onBbsPostUpsert(h: Handler<BbsPostEvent>): void {
  postUpsert.add(h);
}
export function offBbsPostUpsert(h: Handler<BbsPostEvent>): void {
  postUpsert.delete(h);
}

function fire<T>(set: Set<Handler<T>>, e: T): void {
  for (const h of set) {
    try {
      void h(e);
    } catch (err: unknown) {
      console.error("[bbs] event handler error:", err);
    }
  }
}

export function emitBbsBoard(board: IBoard): void {
  fire(boardUpsert, { board, at: Date.now() });
}

export function emitBbsBoardDelete(
  id: string,
  num?: number,
): void {
  fire(boardDelete, { id, num, at: Date.now() });
}

export function emitBbsPost(
  board: IBoard,
  post: IPost,
): void {
  fire(postUpsert, {
    boardId: board.id,
    boardNum: board.num,
    post,
    at: Date.now(),
  });
}
