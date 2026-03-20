import { dbojs } from "../../services/Database/index.ts";
import { boards, posts, getNextPostId } from "./db.ts";
import type { IBoard, IPost } from "./db.ts";

// ─── helpers ─────────────────────────────────────────────────────────────────

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function isStaffUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  const flags = player.flags || "";
  return flags.includes("admin") || flags.includes("wizard") || flags.includes("superuser");
}

async function getNewCountForUser(
  boardNum: number,
  userId: string
): Promise<number> {
  const player = await dbojs.queryOne({ id: userId });
  const lastRead = ((player && player.data?.bbLastRead) as Record<string, number>) || {};
  const lastReadNum = lastRead[String(boardNum)] || 0;
  const allPosts = await posts.query({ boardId: boardNum });
  return allPosts.filter((p) => p.num > lastReadNum).length;
}

// ─── route handler ────────────────────────────────────────────────────────────

export async function bboardsRouteHandler(
  req: Request,
  userId: string | null
): Promise<Response> {
  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method;

  if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

  // ── GET /api/v1/boards ───────────────────────────────────────────────────
  if (path === "/api/v1/boards" && method === "GET") {
    const all = await boards.query({});
    all.sort((a, b) => a.num - b.num);

    const result = await Promise.all(
      all.map(async (b) => {
        const boardPosts = await posts.query({ boardId: b.num });
        const newCount = await getNewCountForUser(b.num, userId);
        return { ...b, postCount: boardPosts.length, newCount };
      })
    );

    return jsonResponse(result);
  }

  // ── POST /api/v1/boards ──────────────────────────────────────────────────
  if (path === "/api/v1/boards" && method === "POST") {
    const staff = await isStaffUser(userId);
    if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const title = typeof body.name === "string" ? body.name.trim() : "";
    if (!title) return jsonResponse({ error: "name is required" }, 400);

    const allBoards = await boards.query({});
    const num = typeof body.order === "number" ? body.order : allBoards.length + 1;

    const existing = await boards.queryOne({ num });
    if (existing) return jsonResponse({ error: "Board already exists" }, 409);

    const id = `board-${num}`;
    const readLock  = typeof body.readLock  === "string" ? body.readLock  : "";
    const writeLock = typeof body.writeLock === "string" ? body.writeLock : "";

    const board: IBoard = {
      id,
      num,
      title,
      timeout: 0,
      anonymous: false,
      readLock,
      writeLock,
      pendingDelete: false,
    };
    await boards.create(board);
    return jsonResponse(board, 201);
  }

  // ── GET /api/v1/boards/unread ────────────────────────────────────────────
  if (path === "/api/v1/boards/unread" && method === "GET") {
    const all = await boards.query({});
    const result = await Promise.all(
      all.map(async (b) => ({
        boardId: b.id,
        boardName: b.title,
        newCount: await getNewCountForUser(b.num, userId),
      }))
    );
    const total = result.reduce((sum, r) => sum + r.newCount, 0);
    return jsonResponse({ total, boards: result.filter((r) => r.newCount > 0) });
  }

  // ── board by :id sub-routes ──────────────────────────────────────────────
  const boardMatch = path.match(/^\/api\/v1\/boards\/([^/]+)(\/posts(?:\/(\d+))?|\/read)?$/);
  if (boardMatch) {
    const boardId  = boardMatch[1];
    const sub      = boardMatch[2] || "";
    const postNum  = boardMatch[3] ? parseInt(boardMatch[3], 10) : NaN;

    // Try to find board by numeric id or string id
    const boardNum = parseInt(boardId, 10);
    const board = !isNaN(boardNum)
      ? await boards.queryOne({ num: boardNum })
      : await boards.queryOne({ id: boardId });
    if (!board) return jsonResponse({ error: "Board not found" }, 404);

    // ── GET /api/v1/boards/:id ─────────────────────────────────────────────
    if (!sub && method === "GET") {
      const boardPosts = await posts.query({ boardId: board.num });
      const newCount = await getNewCountForUser(board.num, userId);
      return jsonResponse({ ...board, postCount: boardPosts.length, newCount });
    }

    // ── PATCH /api/v1/boards/:id ───────────────────────────────────────────
    if (!sub && method === "PATCH") {
      const staff = await isStaffUser(userId);
      if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const ALLOWED = ["title", "timeout", "anonymous", "readLock", "writeLock"];
      const update: Partial<IBoard> = {};
      for (const field of ALLOWED) {
        if (field in body) (update as Record<string, unknown>)[field] = body[field];
      }
      const updated: IBoard = { ...board, ...update };
      await boards.update({ id: board.id }, updated);
      return jsonResponse(updated);
    }

    // ── DELETE /api/v1/boards/:id ──────────────────────────────────────────
    if (!sub && method === "DELETE") {
      const staff = await isStaffUser(userId);
      if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

      await boards.delete({ id: board.id });
      await posts.delete({ boardId: board.num });
      return jsonResponse({ deleted: true });
    }

    // ── GET /api/v1/boards/:id/posts ───────────────────────────────────────
    if (sub === "/posts" && method === "GET") {
      const params = url.searchParams;
      const limit  = Math.min(parseInt(params.get("limit")  || "50", 10), 200);
      const offset = Math.max(parseInt(params.get("offset") || "0",  10), 0);

      const boardPosts = await posts.query({ boardId: board.num });
      boardPosts.sort((a, b) => a.num - b.num);
      const page = boardPosts.slice(offset, offset + limit);
      return jsonResponse({ total: boardPosts.length, posts: page });
    }

    // ── POST /api/v1/boards/:id/posts ──────────────────────────────────────
    if (sub === "/posts" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const subject = typeof body.subject === "string" ? body.subject.trim() : "";
      const postBody  = typeof body.body    === "string" ? body.body.trim()    : "";
      if (!subject || !postBody) return jsonResponse({ error: "subject and body are required" }, 400);

      const player = await dbojs.queryOne({ id: userId });
      const authorName = (player && player.data?.name) || userId;

      const allPosts = await posts.query({ boardId: board.num });
      const num = allPosts.length > 0
        ? Math.max(...allPosts.map((p) => p.num)) + 1
        : 1;
      const globalId = await getNextPostId();
      const id  = `bbpost-${globalId}`;

      const post: IPost = {
        id,
        boardId: board.num,
        num,
        globalId,
        subject,
        body: postBody,
        authorId: userId,
        authorName: String(authorName),
        createdAt: Date.now(),
        timeout: 0,
        editCount: 0,
        replies: [],
      };

      await posts.create(post);
      return jsonResponse(post, 201);
    }

    // ── GET /api/v1/boards/:id/posts/:num ─────────────────────────────────
    if (sub.startsWith("/posts/") && !isNaN(postNum) && method === "GET") {
      const post = await posts.queryOne({ boardId: board.num, num: postNum });
      if (!post) return jsonResponse({ error: "Post not found" }, 404);
      return jsonResponse(post);
    }

    // ── PATCH /api/v1/boards/:id/posts/:num ────────────────────────────────
    if (sub.startsWith("/posts/") && !isNaN(postNum) && method === "PATCH") {
      const post = await posts.queryOne({ boardId: board.num, num: postNum });
      if (!post) return jsonResponse({ error: "Post not found" }, 404);

      const staff = await isStaffUser(userId);
      if (post.authorId !== userId && !staff) return jsonResponse({ error: "Forbidden" }, 403);

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const newBody    = typeof body.body    === "string" ? body.body.trim()    : post.body;
      const newSubject = typeof body.subject === "string" ? body.subject.trim() : post.subject;

      const updated: IPost = { ...post, body: newBody, subject: newSubject, editCount: post.editCount + 1 };
      await posts.update({ id: post.id }, updated);
      return jsonResponse(updated);
    }

    // ── DELETE /api/v1/boards/:id/posts/:num ──────────────────────────────
    if (sub.startsWith("/posts/") && !isNaN(postNum) && method === "DELETE") {
      const post = await posts.queryOne({ boardId: board.num, num: postNum });
      if (!post) return jsonResponse({ error: "Post not found" }, 404);

      const staff = await isStaffUser(userId);
      if (post.authorId !== userId && !staff) return jsonResponse({ error: "Forbidden" }, 403);

      await posts.delete({ id: post.id });
      return jsonResponse({ deleted: true });
    }

    // ── POST /api/v1/boards/:id/read ──────────────────────────────────────
    if (sub === "/read" && method === "POST") {
      const boardPosts = await posts.query({ boardId: board.num });
      const maxNum = boardPosts.reduce((m, p) => Math.max(m, p.num), 0);

      const player = await dbojs.queryOne({ id: userId });
      if (player) {
        player.data ||= {};
        const lastRead = (player.data.bbLastRead as Record<string, number>) || {};
        lastRead[String(board.num)] = maxNum;
        player.data.bbLastRead = lastRead;
        await dbojs.modify({ id: player.id }, "$set", player);
      }

      return jsonResponse({ boardId: board.id, lastRead: maxNum });
    }
  }

  return jsonResponse({ error: "Not Found" }, 404);
}
