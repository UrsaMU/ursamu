/**
 * Create / reply helpers for the staff Jobs BBS board.
 * Used by job-bridge event handlers.
 */

import { boards, posts, getNextPostNum } from "./db.ts";
import type { IBoard, IPost, IReply } from "./db.ts";
import { getBoardPosts } from "./query.ts";
import { send, sessions, dbojs } from "@ursamu/mush";
import {
  bucketLabel,
  formatCreatedBody,
  formatCreatedSubject,
  jobTag,
  type IBridgeJob,
} from "./job-format.ts";

const JOBS_TITLE = "Jobs";
const SYS_ID = "system";
const SYS_NAME = "Jobs System";

export async function getJobsBoard(): Promise<IBoard | null> {
  const found = await boards.query({ title: JOBS_TITLE });
  return found[0] ?? null;
}

// deno-lint-ignore no-explicit-any
async function notifyBoardReaders(board: IBoard, message: string) {
  try {
    const notified = new Set<string>();
    for (const sess of sessions.list()) {
      const actorId = sess.meta.actorId as string | undefined;
      if (!actorId || notified.has(actorId)) continue;

      const playerObj = await dbojs.queryOne({ id: actorId });
      if (!playerObj) continue;

      // Normalize flags to a Set
      const flags = new Set(
        Array.isArray(playerObj.flags)
          ? playerObj.flags
          : typeof playerObj.flags === "string"
          ? playerObj.flags.split(" ").filter(Boolean)
          : (playerObj.flags as unknown) instanceof Set
          ? Array.from(playerObj.flags as Set<string>)
          : [],
      );

      // Check staff or read lock
      let canRead = flags.has("superuser") || flags.has("admin") || flags.has("wizard");
      if (!canRead) {
        if (!board.readLock || board.readLock === "all()") {
          canRead = true;
        } else if (board.readLock === "faction" && board.ownerId) {
          const faction = await dbojs.queryOne({ id: board.ownerId });
          const contents = (faction?.contents as string[] | undefined) ?? [];
          if (contents.includes(actorId)) {
            canRead = true;
          }
        }
      }

      if (canRead) {
        // Check player's notification preferences for this board
        const state = (playerObj.state ?? {}) as Record<string, any>;
        const bbNotify = (state.bb_notify ?? {}) as Record<string, boolean>;
        if (bbNotify[String(board.num)] !== false) {
          send([sess.socketId], message);
          notified.add(actorId);
        }
      }
    }
  } catch (e: unknown) {
    console.error("[bbs] notifyBoardReaders failed:", e);
  }
}

export async function findJobPost(
  jobNum: number,
): Promise<{ board: IBoard; post: IPost } | null> {
  const board = await getJobsBoard();
  if (!board) return null;
  const tag = jobTag(jobNum);
  const all = await getBoardPosts(board.num);
  const post = all.find((p) => (p.tags ?? []).includes(tag));
  if (!post) return null;
  return { board, post };
}

function nextReplyNum(post: IPost): number {
  const replies = post.replies ?? [];
  if (!replies.length) return 1;
  return Math.max(...replies.map((r) => r.num)) + 1;
}

export async function appendJobReply(
  post: IPost,
  subject: string,
  body: string,
): Promise<void> {
  const num = nextReplyNum(post);
  const reply: IReply = {
    num,
    subject: subject.slice(0, 120),
    body: body.slice(0, 4000),
    authorId: SYS_ID,
    authorName: SYS_NAME,
    createdAt: Date.now(),
    editCount: 0,
  };
  await posts.modify({ id: post.id }, "$set", {
    replies: [...(post.replies ?? []), reply],
  });

  const board = await getJobsBoard();
  if (board) {
    const msg = `%ch>BBS:%cn New reply on %cc${board.title}%cn/${post.num} (${post.subject}) by %cc${SYS_NAME}%cn.`;
    await notifyBoardReaders(board, msg);
  }
}

/** Create the root BBS post for a new job (no-op if already posted). */
export async function createJobPost(job: IBridgeJob): Promise<void> {
  const board = await getJobsBoard();
  if (!board) return;
  if (await findJobPost(job.number)) return;

  const num = await getNextPostNum(board.num);
  const post: IPost = {
    id: crypto.randomUUID(),
    boardId: board.num,
    num,
    subject: formatCreatedSubject(job),
    body: formatCreatedBody(job),
    authorId: SYS_ID,
    authorName: SYS_NAME,
    createdAt: Date.now(),
    timeout: 0,
    editCount: 0,
    replies: [],
    sticky: false,
    tags: [jobTag(job.number), bucketLabel(job).toLowerCase()],
    flags: [],
    watchers: [],
  };
  await posts.create(post);

  const msg = `%ch>BBS:%cn New message on board ${board.num}: %cc${post.subject}%cn.`;
  await notifyBoardReaders(board, msg);
}

/** Reply to a job post; synthesizes the root post if missing. */
export async function replyToJob(
  job: IBridgeJob,
  subject: string,
  body: string,
): Promise<void> {
  let hit = await findJobPost(job.number);
  if (!hit) {
    await createJobPost(job);
    hit = await findJobPost(job.number);
    if (!hit) return;
  }
  await appendJobReply(hit.post, subject, body);
}
