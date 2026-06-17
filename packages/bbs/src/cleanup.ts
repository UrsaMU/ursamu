import { boards, posts, getNextPostNum } from "./db.ts";
import type { IPost } from "./db.ts";
import { getBoardPosts, renumberPosts } from "./query.ts";
import { getConfig } from "./tracking.ts";

/**
 * Move a post to an archive board instead of deleting it.
 * Assigns the next post number on the archive board.
 */
async function archivePost(post: IPost, archiveBoardNum: number): Promise<void> {
  const newNum = await getNextPostNum(archiveBoardNum);
  await posts.create({
    ...post,
    id: crypto.randomUUID(),
    boardId: archiveBoardNum,
    num: newNum,
    sticky: false,
    flags: [],
    watchers: [],
  });
}

/**
 * Delete or archive expired posts across all boards.
 * Returns the count of posts processed.
 *
 * Controlled by the `autoTimeout` global config flag.
 */
export async function cleanupExpiredPosts(): Promise<number> {
  const cfg = await getConfig();
  if (!cfg.autoTimeout) return 0;

  const now        = Date.now();
  const allBoards  = (await boards.query({})).filter((b) => b.id !== "bbconfig");
  let processed    = 0;

  for (const board of allBoards) {
    if (board.type === "archive") continue;
    const boardTimeout = board.timeout || cfg.timeout;
    if (boardTimeout <= 0) continue;

    const boardPosts = await getBoardPosts(board.num);
    let boardChanged = false;

    for (const post of boardPosts) {
      const postTimeout = post.timeout || boardTimeout;
      if (postTimeout <= 0) continue;
      const ageMs = now - post.createdAt;
      const limitMs = postTimeout * 24 * 60 * 60 * 1000;
      if (ageMs <= limitMs) continue;

      // Archive or delete
      if (board.archiveTo) {
        const archiveBoard = await boards.queryOne({ id: board.archiveTo });
        if (archiveBoard) {
          await archivePost(post, archiveBoard.num);
        }
      }
      await posts.delete({ id: post.id });
      boardChanged = true;
      processed++;
    }

    if (boardChanged) await renumberPosts(board.num);
  }

  return processed;
}

/** Start the periodic cleanup interval (every 6 hours). */
export function startCleanupInterval(): void {
  const run = async () => {
    try {
      const n = await cleanupExpiredPosts();
      if (n > 0) console.log(`[bbs] Cleaned up ${n} expired post(s).`);
    } catch {
      // Non-fatal
    }
  };

  run();
  setInterval(run, 6 * 60 * 60 * 1000);
}
