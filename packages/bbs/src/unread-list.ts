/**
 * Shared unread listing for +bbnew / scans.
 */
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  getAllBoards,
  findBoard,
  getBoardPosts,
  resolveKey,
} from "./query.ts";
import { canRead } from "./permissions.ts";
import { getUnreadKeys, isMember } from "./tracking.ts";
import { bbDate } from "./display.ts";
import type { IBoard, IPost } from "./db.ts";

export async function collectUnreadRows(
  u: IUrsamuSDK,
  boardStr: string,
): Promise<string[]> {
  const boards = await boardsToScan(u, boardStr);
  const rows: string[] = [];
  for (const board of boards) {
    const unread = await getUnreadKeys(u, board.num);
    if (!unread.length) continue;
    const bPosts = await getBoardPosts(board.num);
    for (const key of unread) {
      const line = formatUnreadLine(board, bPosts, key);
      if (line) rows.push(line);
    }
  }
  return rows;
}

export async function boardsToScan(
  u: IUrsamuSDK,
  boardStr: string,
): Promise<IBoard[]> {
  if (boardStr) {
    const { board } = await findBoard(boardStr);
    if (!board) return [];
    if (!(await canRead(u, board))) return [];
    return [board];
  }
  const out: IBoard[] = [];
  for (const b of await getAllBoards()) {
    if (!(await canRead(u, b))) continue;
    if (!isMember(u, b.num)) continue;
    out.push(b);
  }
  return out;
}

export function formatUnreadLine(
  board: IBoard,
  bPosts: IPost[],
  key: string,
): string | null {
  const { post, reply } = resolveKey(bPosts, key);
  if (!post) return null;
  const msg = reply ?? post;
  const author = board.anonymous ? "Anonymous" : msg.authorName;
  const subj = (msg.subject ?? "").slice(0, 34);
  const id = `${board.num}/${key}`;
  return (
    `  %cc${id.padEnd(10)}%cn` +
    subj.padEnd(36).slice(0, 36) +
    bbDate(msg.createdAt).padEnd(10) +
    author.slice(0, 16)
  );
}
