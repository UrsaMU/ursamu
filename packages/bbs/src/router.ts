import { dbojs } from "@ursamu/mush";
import { boards, posts, getNextPostNum } from "./db.ts";
import type { IBoard, IPost } from "./db.ts";
import { getAllBoards, getBoardPosts, getPost } from "./query.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function isStaffUser(userId: string): Promise<boolean> {
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  const flags = String(player.flags ?? "");
  return flags.includes("admin") || flags.includes("wizard") || flags.includes("superuser");
}

function isBoardModUser(userId: string, board: IBoard): boolean {
  return (board.moderators ?? []).includes(userId);
}

async function canAccessBoard(userId: string, board: IBoard): Promise<boolean> {
  if (!board.readLock || board.readLock === "all()") return true;
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  if (String(player.flags ?? "").match(/admin|wizard|superuser/)) return true;
  if (board.readLock === "faction" && board.ownerId) {
    const faction = await dbojs.queryOne({ id: board.ownerId });
    return ((faction?.contents as string[] | undefined) ?? []).includes(userId);
  }
  return false;
}

function getReadSet(player: Record<string, unknown>, boardNum: number): Set<string> {
  const bbRead = (player.bb_read as Record<string, string[]>) ?? {};
  return new Set(bbRead[String(boardNum)] ?? []);
}

export async function bboardsRouteHandler(req: Request, userId: string | null): Promise<Response> {
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method;

  // ── GET /api/v1/boards/categories ─────────────────────────────────────────
  if (path === "/api/v1/boards/categories" && method === "GET") {
    const allBoards = await getAllBoards();
    const cats = [...new Set(allBoards.map((b) => b.category || "General"))];
    return json({ categories: cats });
  }

  // ── GET /api/v1/boards ────────────────────────────────────────────────────
  if (path === "/api/v1/boards" && method === "GET") {
    const allBoards = await getAllBoards();
    const player    = await dbojs.queryOne({ id: userId });
    const result    = await Promise.all(
      allBoards.filter(async (b) => await canAccessBoard(userId, b)).map(async (b) => {
        const bPosts  = await getBoardPosts(b.num);
        const readSet = player ? getReadSet(player.data as Record<string, unknown>, b.num) : new Set<string>();
        const unread  = bPosts.filter((p) => !readSet.has(String(p.num))).length;
        return { ...b, postCount: bPosts.length, unreadCount: unread };
      }),
    );
    return json(result);
  }

  // ── POST /api/v1/boards ───────────────────────────────────────────────────
  if (path === "/api/v1/boards" && method === "POST") {
    if (!(await isStaffUser(userId))) return json({ error: "Forbidden" }, 403);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const title = typeof body.name === "string" ? body.name.trim() : "";
    if (!title) return json({ error: "name is required" }, 400);
    const existing = await boards.queryOne({ title });
    if (existing) return json({ error: "Board already exists" }, 409);
    const { getNextBoardNum } = await import("./db.ts");
    const num = await getNextBoardNum();
    const board: IBoard = {
      id: `board-${num}`, num, title,
      timeout: 0, anonymous: false, readLock: "all()", writeLock: "all()",
      pendingDelete: false, category: typeof body.category === "string" ? body.category : "General",
      type: "normal", moderators: [],
    };
    await boards.create(board);
    return json(board, 201);
  }

  // ── GET /api/v1/boards/:id ────────────────────────────────────────────────
  const boardMatch = path.match(/^\/api\/v1\/boards\/([^/]+)$/);
  if (boardMatch && method === "GET") {
    const board = await boards.queryOne({ id: boardMatch[1] });
    if (!board || board.id === "bbconfig") return json({ error: "Not found" }, 404);
    if (!(await canAccessBoard(userId, board))) return json({ error: "Forbidden" }, 403);
    return json(board);
  }

  // ── PATCH /api/v1/boards/:id ──────────────────────────────────────────────
  if (boardMatch && method === "PATCH") {
    if (!(await isStaffUser(userId))) return json({ error: "Forbidden" }, 403);
    const board = await boards.queryOne({ id: boardMatch[1] });
    if (!board || board.id === "bbconfig") return json({ error: "Not found" }, 404);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const allowed: (keyof IBoard)[] = ["title", "readLock", "writeLock", "timeout", "anonymous", "category", "type", "webhookUrl", "archiveTo"];
    const patch: Partial<IBoard> = {};
    for (const k of allowed) { if (k in body) (patch as Record<string, unknown>)[k] = body[k]; }
    await boards.modify({ id: board.id }, "$set", patch);
    return json({ ...board, ...patch });
  }

  // ── DELETE /api/v1/boards/:id ─────────────────────────────────────────────
  if (boardMatch && method === "DELETE") {
    if (!(await isStaffUser(userId))) return json({ error: "Forbidden" }, 403);
    const board = await boards.queryOne({ id: boardMatch[1] });
    if (!board || board.id === "bbconfig") return json({ error: "Not found" }, 404);
    const bPosts = await getBoardPosts(board.num);
    for (const p of bPosts) await posts.delete({ id: p.id });
    await boards.delete({ id: board.id });
    return new Response(null, { status: 204 });
  }

  // ── GET /api/v1/boards/:id/posts ──────────────────────────────────────────
  const postsMatch = path.match(/^\/api\/v1\/boards\/([^/]+)\/posts$/);
  if (postsMatch && method === "GET") {
    const board = await boards.queryOne({ id: postsMatch[1] });
    if (!board || board.id === "bbconfig") return json({ error: "Not found" }, 404);
    if (!(await canAccessBoard(userId, board))) return json({ error: "Forbidden" }, 403);
    const limit  = parseInt(url.searchParams.get("limit") ?? "20", 10);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const bPosts = await getBoardPosts(board.num);
    return json({ total: bPosts.length, posts: bPosts.slice(offset, offset + limit) });
  }

  // ── POST /api/v1/boards/:id/posts ─────────────────────────────────────────
  if (postsMatch && method === "POST") {
    const board = await boards.queryOne({ id: postsMatch[1] });
    if (!board || board.id === "bbconfig") return json({ error: "Not found" }, 404);
    if (board.type === "archive") return json({ error: "Archive boards are read-only" }, 400);
    if (!(await canAccessBoard(userId, board))) return json({ error: "Forbidden" }, 403);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const text    = typeof body.body    === "string" ? body.body.trim()    : "";
    if (!subject || !text) return json({ error: "subject and body are required" }, 400);
    const player  = await dbojs.queryOne({ id: userId });
    const num     = await getNextPostNum(board.num);
    const post: IPost = {
      id: crypto.randomUUID(), boardId: board.num, num, subject, body: text,
      authorId: userId, authorName: (player?.data?.name as string | undefined) ?? "Unknown",
      createdAt: Date.now(), timeout: 0, editCount: 0,
      replies: [], sticky: false, tags: [], flags: [], watchers: [],
    };
    await posts.create(post);
    return json(post, 201);
  }

  // ── Single-post routes: /api/v1/boards/:id/posts/:num ─────────────────────
  const singlePostMatch = path.match(/^\/api\/v1\/boards\/([^/]+)\/posts\/(\d+)$/);
  if (singlePostMatch) {
    const board = await boards.queryOne({ id: singlePostMatch[1] });
    if (!board || board.id === "bbconfig") return json({ error: "Not found" }, 404);
    const postNum = parseInt(singlePostMatch[2], 10);
    const post    = await getPost(board.num, postNum);
    if (!post) return json({ error: "Not found" }, 404);

    if (method === "GET") {
      if (!(await canAccessBoard(userId, board))) return json({ error: "Forbidden" }, 403);
      return json(post);
    }
    if (method === "PATCH") {
      const isOwner = post.authorId === userId;
      const canEdit = isOwner || isBoardModUser(userId, board) || (await isStaffUser(userId));
      if (!canEdit) return json({ error: "Forbidden" }, 403);
      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      const patch: Partial<IPost> = {};
      if (typeof body.subject === "string") patch.subject = body.subject.trim();
      if (typeof body.body    === "string") patch.body    = body.body.trim();
      patch.editCount = post.editCount + 1;
      await posts.modify({ id: post.id }, "$set", patch);
      return json({ ...post, ...patch });
    }
    if (method === "DELETE") {
      const isOwner = post.authorId === userId;
      const canDel  = isOwner || isBoardModUser(userId, board) || (await isStaffUser(userId));
      if (!canDel) return json({ error: "Forbidden" }, 403);
      await posts.delete({ id: post.id });
      return new Response(null, { status: 204 });
    }
  }

  // ── Flag routes ───────────────────────────────────────────────────────────
  const flagsMatch = path.match(/^\/api\/v1\/boards\/([^/]+)\/posts\/(\d+)\/flags$/);
  if (flagsMatch) {
    const board = await boards.queryOne({ id: flagsMatch[1] });
    if (!board) return json({ error: "Not found" }, 404);
    const post  = await getPost(board.num, parseInt(flagsMatch[2], 10));
    if (!post)  return json({ error: "Not found" }, 404);
    if (!isBoardModUser(userId, board) && !(await isStaffUser(userId))) return json({ error: "Forbidden" }, 403);
    if (method === "GET") return json({ flags: post.flags ?? [] });
    if (method === "DELETE") {
      await posts.modify({ id: post.id }, "$set", { flags: [] });
      return new Response(null, { status: 204 });
    }
  }

  // ── Watch toggle ──────────────────────────────────────────────────────────
  const watchMatch = path.match(/^\/api\/v1\/boards\/([^/]+)\/posts\/(\d+)\/watch$/);
  if (watchMatch && method === "POST") {
    const board = await boards.queryOne({ id: watchMatch[1] });
    if (!board) return json({ error: "Not found" }, 404);
    const post  = await getPost(board.num, parseInt(watchMatch[2], 10));
    if (!post)  return json({ error: "Not found" }, 404);
    const watchers = post.watchers ?? [];
    const watching = watchers.includes(userId);
    await posts.modify({ id: post.id }, "$set", {
      watchers: watching ? watchers.filter((w) => w !== userId) : [...watchers, userId].slice(0, 50),
    });
    return json({ watching: !watching });
  }

  // ── Mark board read ───────────────────────────────────────────────────────
  const readMatch = path.match(/^\/api\/v1\/boards\/([^/]+)\/read$/);
  if (readMatch && method === "POST") {
    const board  = await boards.queryOne({ id: readMatch[1] });
    if (!board)  return json({ error: "Not found" }, 404);
    const player = await dbojs.queryOne({ id: userId });
    if (!player) return json({ error: "Not found" }, 404);
    const bPosts = await getBoardPosts(board.num);
    const keys   = bPosts.map((p) => String(p.num));
    const bbRead = ((player.data?.bb_read) as Record<string, string[]>) ?? {};
    bbRead[String(board.num)] = keys;
    await dbojs.modify({ id: userId }, "$set", { "data.bb_read": bbRead });
    return json({ read: true });
  }

  return json({ error: "Not found" }, 404);
}
