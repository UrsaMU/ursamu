/**
 * Create / reply helpers for the staff Jobs BBS board.
 * Used by job-bridge event handlers.
 */

import { boards, posts, getNextPostNum } from "./db.ts";
import type { IBoard, IPost, IReply } from "./db.ts";
import { getBoardPosts } from "./query.ts";
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
