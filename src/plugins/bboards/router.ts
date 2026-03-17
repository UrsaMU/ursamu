import { bboards, bboard as bbPosts, dbojs } from "../../services/Database/index.ts";
import type { IBBoard } from "../../@types/IBBoard.ts";
import type { IBBoardPost } from "../../@types/IBBoardPost.ts";

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
  boardId: string,
  userId: string
): Promise<number> {
  const player = await dbojs.queryOne({ id: userId });
  const lastRead = ((player && player.data?.bbLastRead) as Record<string, number>) || {};
  const lastReadNum = lastRead[boardId] || 0;
  const posts = await bbPosts.query({ board: boardId });
  return posts.filter((p) => p.num > lastReadNum).length;
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
    const all = await bboards.query({});
    all.sort((a, b) => a.order - b.order);

    const result = await Promise.all(
      all.map(async (b) => {
        const posts = await bbPosts.query({ board: b.id });
        const newCount = await getNewCountForUser(b.id, userId);
        return { ...b, postCount: posts.length, newCount };
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

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return jsonResponse({ error: "name is required" }, 400);

    const id = name.toLowerCase().replace(/\s+/g, "-");
    const existing = await bboards.queryOne({ id });
    if (existing) return jsonResponse({ error: "Board already exists" }, 409);

    const allBoards = await bboards.query({});
    const order = typeof body.order === "number" ? body.order : allBoards.length + 1;
    const description = typeof body.description === "string" ? body.description.trim() : undefined;
    const readLock  = typeof body.readLock  === "string" ? body.readLock  : undefined;
    const writeLock = typeof body.writeLock === "string" ? body.writeLock : undefined;

    const board: IBBoard = { id, name, order, ...(description ? { description } : {}), ...(readLock ? { readLock } : {}), ...(writeLock ? { writeLock } : {}) };
    await bboards.create(board);
    return jsonResponse(board, 201);
  }

  // ── GET /api/v1/boards/unread ────────────────────────────────────────────
  if (path === "/api/v1/boards/unread" && method === "GET") {
    const all = await bboards.query({});
    const result = await Promise.all(
      all.map(async (b) => ({
        boardId: b.id,
        boardName: b.name,
        newCount: await getNewCountForUser(b.id, userId),
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

    const board = await bboards.queryOne({ id: boardId });
    if (!board) return jsonResponse({ error: "Board not found" }, 404);

    // ── GET /api/v1/boards/:id ─────────────────────────────────────────────
    if (!sub && method === "GET") {
      const posts = await bbPosts.query({ board: boardId });
      const newCount = await getNewCountForUser(boardId, userId);
      return jsonResponse({ ...board, postCount: posts.length, newCount });
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

      const ALLOWED = ["name", "description", "order", "readLock", "writeLock"];
      const update: Partial<IBBoard> = {};
      for (const field of ALLOWED) {
        if (field in body) (update as Record<string, unknown>)[field] = body[field];
      }
      const updated: IBBoard = { ...board, ...update };
      await bboards.update({}, updated);
      return jsonResponse(updated);
    }

    // ── DELETE /api/v1/boards/:id ──────────────────────────────────────────
    if (!sub && method === "DELETE") {
      const staff = await isStaffUser(userId);
      if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

      await bboards.delete({ id: boardId });
      await bbPosts.delete({ board: boardId });
      return jsonResponse({ deleted: true });
    }

    // ── GET /api/v1/boards/:id/posts ───────────────────────────────────────
    if (sub === "/posts" && method === "GET") {
      const params = url.searchParams;
      const limit  = Math.min(parseInt(params.get("limit")  || "50", 10), 200);
      const offset = Math.max(parseInt(params.get("offset") || "0",  10), 0);

      const posts = await bbPosts.query({ board: boardId });
      posts.sort((a, b) => a.num - b.num);
      const page = posts.slice(offset, offset + limit);
      return jsonResponse({ total: posts.length, posts: page });
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

      const allPosts = await bbPosts.query({ board: boardId });
      const num = allPosts.length + 1;
      const id  = crypto.randomUUID();

      const post: IBBoardPost = {
        id,
        board: boardId,
        num,
        subject,
        body: postBody,
        author: userId,
        authorName,
        date: Date.now(),
      };

      await bbPosts.create(post);
      return jsonResponse(post, 201);
    }

    // ── GET /api/v1/boards/:id/posts/:num ─────────────────────────────────
    if (sub.startsWith("/posts/") && !isNaN(postNum) && method === "GET") {
      const post = await bbPosts.queryOne({ board: boardId, num: postNum });
      if (!post) return jsonResponse({ error: "Post not found" }, 404);
      return jsonResponse(post);
    }

    // ── PATCH /api/v1/boards/:id/posts/:num ────────────────────────────────
    if (sub.startsWith("/posts/") && !isNaN(postNum) && method === "PATCH") {
      const post = await bbPosts.queryOne({ board: boardId, num: postNum });
      if (!post) return jsonResponse({ error: "Post not found" }, 404);

      const staff = await isStaffUser(userId);
      if (post.author !== userId && !staff) return jsonResponse({ error: "Forbidden" }, 403);

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const newBody    = typeof body.body    === "string" ? body.body.trim()    : post.body;
      const newSubject = typeof body.subject === "string" ? body.subject.trim() : post.subject;

      const updated: IBBoardPost = { ...post, body: newBody, subject: newSubject, edited: Date.now() };
      await bbPosts.update({}, updated);
      return jsonResponse(updated);
    }

    // ── DELETE /api/v1/boards/:id/posts/:num ──────────────────────────────
    if (sub.startsWith("/posts/") && !isNaN(postNum) && method === "DELETE") {
      const post = await bbPosts.queryOne({ board: boardId, num: postNum });
      if (!post) return jsonResponse({ error: "Post not found" }, 404);

      const staff = await isStaffUser(userId);
      if (post.author !== userId && !staff) return jsonResponse({ error: "Forbidden" }, 403);

      await bbPosts.delete({ id: post.id });
      return jsonResponse({ deleted: true });
    }

    // ── POST /api/v1/boards/:id/read ──────────────────────────────────────
    if (sub === "/read" && method === "POST") {
      const posts = await bbPosts.query({ board: boardId });
      const maxNum = posts.reduce((m, p) => Math.max(m, p.num), 0);

      const player = await dbojs.queryOne({ id: userId });
      if (player) {
        player.data ||= {};
        const lastRead = (player.data.bbLastRead as Record<string, number>) || {};
        lastRead[boardId] = maxNum;
        player.data.bbLastRead = lastRead;
        await dbojs.modify({ id: player.id }, "$set", player);
      }

      return jsonResponse({ boardId, lastRead: maxNum });
    }
  }

  return jsonResponse({ error: "Not Found" }, 404);
}
