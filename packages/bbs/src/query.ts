import { dbojs } from "@ursamu/mush";
import { boards, posts } from "./db.ts";
import type { IBoard, IPost, IReply } from "./db.ts";

// ---------------------------------------------------------------------------
// Board queries
// ---------------------------------------------------------------------------

export async function getAllBoards(): Promise<IBoard[]> {
  const all = await boards.query({});
  return all.filter((b) => b.id !== "bbconfig").sort((a, b) => a.num - b.num);
}

export async function findBoard(
  query: string,
): Promise<{ board: IBoard | null; error: string | null }> {
  query = query.trim();
  const num = parseInt(query, 10);
  if (!isNaN(num)) {
    const found = await boards.queryOne({ num });
    return found
      ? { board: found, error: null }
      : { board: null, error: "No board with that number." };
  }

  const all  = await getAllBoards();
  const lower = query.toLowerCase();

  const exact = all.find((b) => b.title.toLowerCase() === lower);
  if (exact) return { board: exact, error: null };

  const starts = all.filter((b) => b.title.toLowerCase().startsWith(lower));
  if (starts.length === 1) return { board: starts[0], error: null };
  if (starts.length > 1) {
    return { board: null, error: `Ambiguous: ${starts.map((b) => `${b.num}:${b.title}`).join(", ")}` };
  }

  const sub = all.filter((b) => b.title.toLowerCase().includes(lower));
  if (sub.length === 1) return { board: sub[0], error: null };
  if (sub.length > 1) {
    return { board: null, error: `Ambiguous: ${sub.map((b) => `${b.num}:${b.title}`).join(", ")}` };
  }

  return { board: null, error: "No matching board found." };
}

// ---------------------------------------------------------------------------
// Post queries
// ---------------------------------------------------------------------------

/**
 * Returns posts sorted sticky-first, then by num ascending.
 */
export async function getBoardPosts(boardNum: number): Promise<IPost[]> {
  const all = await posts.query({ boardId: boardNum });
  return all.sort((a, b) => {
    if (a.sticky && !b.sticky) return -1;
    if (!a.sticky && b.sticky) return 1;
    return a.num - b.num;
  });
}

export async function getPost(
  boardNum: number,
  postNum: number,
): Promise<IPost | null> {
  return await posts.queryOne({ boardId: boardNum, num: postNum }) ?? null;
}

export function getReply(post: IPost, replyNum: number): IReply | undefined {
  return (post.replies ?? []).find((r) => r.num === replyNum);
}

export function getNextReplyNum(post: IPost): number {
  if (!post.replies?.length) return 1;
  return Math.max(...post.replies.map((r) => r.num)) + 1;
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

export function parseBoardPost(
  args: string,
): { boardStr: string; postStr: string } | null {
  const idx = args.indexOf("/");
  if (idx === -1) return null;
  return { boardStr: args.slice(0, idx).trim(), postStr: args.slice(idx + 1).trim() };
}

export function parsePostSpec(
  spec: string,
  boardPosts: IPost[],
): number[] | "unread" | null {
  spec = spec.trim();
  if (spec.toLowerCase() === "u") return "unread";
  const postNums = new Set(boardPosts.map((p) => p.num));
  const nums: number[] = [];
  for (const part of spec.split(",")) {
    const trimmed = part.trim();
    if (trimmed.includes("-")) {
      const [sStr, eStr] = trimmed.split("-", 2);
      let s = parseInt(sStr, 10);
      let e = parseInt(eStr, 10);
      if (isNaN(s) || isNaN(e)) return null;
      if (s > e) { const tmp = s; s = e; e = tmp; }
      for (let i = s; i <= e; i++) { if (postNums.has(i)) nums.push(i); }
    } else {
      const n = parseInt(trimmed, 10);
      if (isNaN(n)) return null;
      if (postNums.has(n)) nums.push(n);
    }
  }
  return nums;
}

export function resolveKey(
  boardPosts: IPost[],
  msgKey: string,
): { post: IPost | null; reply: IReply | undefined } {
  if (msgKey.includes(".")) {
    const [pnStr, rnStr] = msgKey.split(".", 2);
    const post = boardPosts.find((p) => p.num === parseInt(pnStr, 10)) ?? null;
    if (!post) return { post: null, reply: undefined };
    const reply = (post.replies ?? []).find((r) => r.num === parseInt(rnStr, 10));
    return { post, reply };
  }
  const post = boardPosts.find((p) => p.num === parseInt(msgKey, 10)) ?? null;
  return { post, reply: undefined };
}

// ---------------------------------------------------------------------------
// Post renumbering — migrates all players' read-tracking keys after deletion
// ---------------------------------------------------------------------------

export async function renumberPosts(boardNum: number): Promise<void> {
  const boardPosts = await posts.query({ boardId: boardNum });
  boardPosts.sort((a, b) => a.num - b.num);
  if (boardPosts.length === 0) return;

  const numMap = new Map<number, number>();
  for (let i = 0; i < boardPosts.length; i++) {
    const newNum = i + 1;
    if (boardPosts[i].num !== newNum) {
      numMap.set(boardPosts[i].num, newNum);
      await posts.modify({ id: boardPosts[i].id }, "$set", { num: newNum });
    }
  }
  if (numMap.size === 0) return;

  try {
    const allPlayers = await dbojs.query({ flags: /player/ });
    for (const player of allPlayers) {
      const readData = (player.data?.bb_read as Record<string, string[]>) ?? {};
      const boardKey = String(boardNum);
      const oldKeys  = readData[boardKey];
      if (!oldKeys?.length) continue;

      readData[boardKey] = oldKeys.map((key) => {
        if (key.includes(".")) {
          const [pStr, rStr] = key.split(".", 2);
          const newP = numMap.get(parseInt(pStr, 10));
          return newP !== undefined ? `${newP}.${rStr}` : key;
        }
        const newP = numMap.get(parseInt(key, 10));
        return newP !== undefined ? String(newP) : key;
      });
      await dbojs.modify({ id: player.id }, "$set", { "data.bb_read": readData });
    }
  } catch {
    // Migration failure is non-fatal
  }
}
