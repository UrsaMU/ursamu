import { dbojs } from "@ursamu/mush";
import { boards, posts, getNextPostNum } from "./db.ts";
import type { IBoard, IPost, IReply } from "./db.ts";
import {
  getAllBoards,
  getBoardPosts,
  getNextReplyNum,
  getPost,
} from "./query.ts";
import {
  canDeletePost,
  canEditPost,
  canModeratePost,
  canReadBoard,
  canWriteBoard,
  flagSetFromRaw,
  getReadSet,
  isStaffFlagSet,
  parseModeratorsField,
} from "./rest-auth.ts";
import {
  emitBbsBoard,
  emitBbsBoardDelete,
  emitBbsPost,
} from "./events.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

async function isStaffUser(userId: string): Promise<boolean> {
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  return isStaffFlagSet(
    flagSetFromRaw(player.flags as unknown),
  );
}

async function isFactionMember(
  userId: string,
  factionId: string,
): Promise<boolean> {
  try {
    const faction = await dbojs.queryOne({ id: factionId });
    if (!faction) return false;
    const contents =
      (faction.contents as string[] | undefined) ?? [];
    return contents.includes(userId) ||
      contents.includes(`#${userId}`);
  } catch (_e: unknown) {
    return false;
  }
}

async function lockOptsFor(
  userId: string,
  staff: boolean,
  lock: string,
  ownerId?: string,
): Promise<{
  staff: boolean;
  inFaction?: boolean;
  flags: Set<string>;
  userId: string;
}> {
  const player = await dbojs.queryOne({ id: userId });
  const flags = flagSetFromRaw(player?.flags as unknown);
  let inFaction = false;
  if (
    !staff &&
    lock === "faction" &&
    ownerId
  ) {
    inFaction = await isFactionMember(userId, ownerId);
  }
  return { staff, inFaction, flags, userId };
}

async function userCanRead(
  userId: string,
  board: IBoard,
  staff: boolean,
): Promise<boolean> {
  const opts = await lockOptsFor(
    userId,
    staff,
    String(board.readLock ?? ""),
    board.ownerId,
  );
  return canReadBoard(board, opts);
}

async function userCanWrite(
  userId: string,
  board: IBoard,
  staff: boolean,
): Promise<boolean> {
  const opts = await lockOptsFor(
    userId,
    staff,
    String(board.writeLock ?? ""),
    board.ownerId,
  );
  return canWriteBoard(board, opts);
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
    const player = await dbojs.queryOne({ id: userId });
    const staff = await isStaffUser(userId);
    const result: unknown[] = [];
    for (const b of allBoards) {
      if (!(await userCanRead(userId, b, staff))) continue;
      const bPosts = await getBoardPosts(b.num);
      const readSet = player
        ? getReadSet(
          player as unknown as Record<string, unknown>,
          b.num,
        )
        : new Set<string>();
      const unread = bPosts.filter(
        (p) => !readSet.has(String(p.num)),
      ).length;
      const flagged = bPosts.reduce(
        (n, p) => n + (p.flags?.length ? 1 : 0),
        0,
      );
      result.push({
        ...b,
        postCount: bPosts.length,
        unreadCount: unread,
        flaggedCount: flagged,
      });
    }
    return json(result);
  }

  // ── POST /api/v1/boards ───────────────────────────────────────────────────
  if (path === "/api/v1/boards" && method === "POST") {
    if (!(await isStaffUser(userId))) return json({ error: "Forbidden" }, 403);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (_e: unknown) {
      return json({ error: "Invalid JSON" }, 400);
    }
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
    emitBbsBoard(board);
    return json(board, 201);
  }

  // ── GET /api/v1/boards/:id ────────────────────────────────────────────────
  const boardMatch = path.match(/^\/api\/v1\/boards\/([^/]+)$/);
  if (boardMatch && method === "GET") {
    const board = await boards.queryOne({ id: boardMatch[1] });
    if (!board || board.id === "bbconfig") {
      return json({ error: "Not found" }, 404);
    }
    const staff = await isStaffUser(userId);
    if (!(await userCanRead(userId, board, staff))) {
      return json({ error: "Forbidden" }, 403);
    }
    return json(board);
  }

  // ── PATCH /api/v1/boards/:id ──────────────────────────────────────────────
  if (boardMatch && method === "PATCH") {
    if (!(await isStaffUser(userId))) return json({ error: "Forbidden" }, 403);
    const board = await boards.queryOne({ id: boardMatch[1] });
    if (!board || board.id === "bbconfig") return json({ error: "Not found" }, 404);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (_e: unknown) {
      return json({ error: "Invalid JSON" }, 400);
    }
    const allowed: (keyof IBoard)[] = [
      "title",
      "readLock",
      "writeLock",
      "timeout",
      "anonymous",
      "category",
      "type",
      "webhookUrl",
      "archiveTo",
      "ownerId",
    ];
    const patch: Partial<IBoard> = {};
    for (const k of allowed) {
      if (k in body) {
        (patch as Record<string, unknown>)[k] = body[k];
      }
    }
    if ("moderators" in body) {
      const mods = parseModeratorsField(body.moderators);
      if (mods !== undefined) patch.moderators = mods;
    }
    if ("timeout" in patch) {
      const t = Number(patch.timeout);
      patch.timeout = Number.isFinite(t) ? t : board.timeout;
    }
    if ("anonymous" in patch) {
      patch.anonymous = Boolean(patch.anonymous);
    }
    await boards.modify({ id: board.id }, "$set", patch);
    const updated = await boards.queryOne({ id: board.id });
    const out = updated ?? { ...board, ...patch };
    emitBbsBoard(out as IBoard);
    return json(out);
  }

  // ── DELETE /api/v1/boards/:id ─────────────────────────────────────────────
  if (boardMatch && method === "DELETE") {
    if (!(await isStaffUser(userId))) return json({ error: "Forbidden" }, 403);
    const board = await boards.queryOne({ id: boardMatch[1] });
    if (!board || board.id === "bbconfig") return json({ error: "Not found" }, 404);
    const bPosts = await getBoardPosts(board.num);
    for (const p of bPosts) await posts.delete({ id: p.id });
    await boards.delete({ id: board.id });
    emitBbsBoardDelete(board.id, board.num);
    return new Response(null, { status: 204 });
  }

  // ── GET /api/v1/boards/:id/posts ──────────────────────────────────────────
  const postsMatch = path.match(/^\/api\/v1\/boards\/([^/]+)\/posts$/);
  if (postsMatch && method === "GET") {
    const board = await boards.queryOne({ id: postsMatch[1] });
    if (!board || board.id === "bbconfig") {
      return json({ error: "Not found" }, 404);
    }
    const staff = await isStaffUser(userId);
    if (!(await userCanRead(userId, board, staff))) {
      return json({ error: "Forbidden" }, 403);
    }
    const limit = parseInt(
      url.searchParams.get("limit") ?? "20",
      10,
    );
    const offset = parseInt(
      url.searchParams.get("offset") ?? "0",
      10,
    );
    const bPosts = await getBoardPosts(board.num);
    return json({
      total: bPosts.length,
      posts: bPosts.slice(offset, offset + limit),
    });
  }

  // ── POST /api/v1/boards/:id/posts ─────────────────────────────────────────
  if (postsMatch && method === "POST") {
    const board = await boards.queryOne({ id: postsMatch[1] });
    if (!board || board.id === "bbconfig") {
      return json({ error: "Not found" }, 404);
    }
    if (board.type === "archive") {
      return json(
        { error: "Archive boards are read-only" },
        400,
      );
    }
    const staff = await isStaffUser(userId);
    if (!(await userCanWrite(userId, board, staff))) {
      return json({ error: "Forbidden" }, 403);
    }
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (_e: unknown) {
      return json({ error: "Invalid JSON" }, 400);
    }
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
    emitBbsPost(board, post);
    void import("./staff-badge-bridge.ts").then((m) =>
      m.bumpBbsActivityBadge()
    );
    return json(post, 201);
  }

  // ── POST /api/v1/boards/:id/posts/:num/replies ────────────────────────────
  const repliesMatch = path.match(
    /^\/api\/v1\/boards\/([^/]+)\/posts\/(\d+)\/replies$/,
  );
  if (repliesMatch && method === "POST") {
    const board = await boards.queryOne({ id: repliesMatch[1] });
    if (!board || board.id === "bbconfig") {
      return json({ error: "Not found" }, 404);
    }
    if (board.type === "archive") {
      return json(
        { error: "Archive boards are read-only" },
        400,
      );
    }
    const staff = await isStaffUser(userId);
    if (!(await userCanWrite(userId, board, staff))) {
      return json({ error: "Forbidden" }, 403);
    }
    const postNum = parseInt(repliesMatch[2]!, 10);
    const post = await getPost(board.num, postNum);
    if (!post) return json({ error: "Not found" }, 404);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (_e: unknown) {
      return json({ error: "Invalid JSON" }, 400);
    }
    const text = typeof body.body === "string"
      ? body.body.trim()
      : "";
    if (!text) {
      return json({ error: "body is required" }, 400);
    }
    const player = await dbojs.queryOne({ id: userId });
    const authorName = String(
      (player?.data as { name?: string } | undefined)?.name ??
        "Unknown",
    );
    const replyNum = getNextReplyNum(post);
    const reply: IReply = {
      num: replyNum,
      subject: `Re: ${post.subject}`,
      body: text,
      authorId: userId,
      authorName,
      createdAt: Date.now(),
      editCount: 0,
    };
    const replies = [...(post.replies ?? []), reply];
    await posts.modify({ id: post.id }, "$set", { replies });
    const updated = {
      ...post,
      replies,
    };
    emitBbsPost(board, updated);
    void import("./staff-badge-bridge.ts").then((m) =>
      m.bumpBbsActivityBadge()
    );
    return json(reply, 201);
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
      const staff = await isStaffUser(userId);
      if (!(await userCanRead(userId, board, staff))) {
        return json({ error: "Forbidden" }, 403);
      }
      return json(post);
    }
    if (method === "PATCH") {
      const staff = await isStaffUser(userId);
      if (!canEditPost(post, board, userId, staff)) {
        return json({ error: "Forbidden" }, 403);
      }
      const mod = canModeratePost(board, userId, staff);
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch (_e: unknown) {
        return json({ error: "Invalid JSON" }, 400);
      }
      const patch: Partial<IPost> = {};
      if (typeof body.subject === "string") {
        patch.subject = body.subject.trim();
      }
      if (typeof body.body === "string") {
        patch.body = body.body.trim();
      }
      // Sticky / timeout: staff or board mods only
      if (mod && typeof body.sticky === "boolean") {
        patch.sticky = body.sticky;
      }
      if (mod && body.timeout != null) {
        const t = Number(body.timeout);
        if (Number.isFinite(t)) patch.timeout = t;
      }
      if (
        Object.keys(patch).some(
          (k) => k === "subject" || k === "body",
        )
      ) {
        patch.editCount = post.editCount + 1;
      }
      await posts.modify({ id: post.id }, "$set", patch);
      const updated = await posts.queryOne({ id: post.id });
      return json(updated ?? { ...post, ...patch });
    }
    if (method === "DELETE") {
      const staff = await isStaffUser(userId);
      if (!canDeletePost(post, board, userId, staff)) {
        return json({ error: "Forbidden" }, 403);
      }
      await posts.delete({ id: post.id });
      return new Response(null, { status: 204 });
    }
  }

  // ── Flag routes ───────────────────────────────────────────────────────────
  const flagsMatch = path.match(
    /^\/api\/v1\/boards\/([^/]+)\/posts\/(\d+)\/flags$/,
  );
  if (flagsMatch) {
    const board = await boards.queryOne({ id: flagsMatch[1] });
    if (!board) return json({ error: "Not found" }, 404);
    const post = await getPost(
      board.num,
      parseInt(flagsMatch[2], 10),
    );
    if (!post) return json({ error: "Not found" }, 404);
    const staff = await isStaffUser(userId);
    if (!canModeratePost(board, userId, staff)) {
      return json({ error: "Forbidden" }, 403);
    }
    if (method === "GET") return json({ flags: post.flags ?? [] });
    if (method === "DELETE") {
      await posts.modify({ id: post.id }, "$set", { flags: [] });
      void import("./staff-badge-bridge.ts").then((m) =>
        m.publishBbsFlaggedBadgeAndBump()
      );
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
    const st = (player.state ?? {}) as Record<string, unknown>;
    const dt = (player.data ?? {}) as Record<string, unknown>;
    const fromState = st.bb_read as Record<string, string[]> | undefined;
    const fromData  = dt.bb_read as Record<string, string[]> | undefined;
    const bbRead = { ...(fromState ?? fromData ?? {}) };
    bbRead[String(board.num)] = keys;
    await dbojs.modify(
      { id: userId },
      "$set",
      { "state.bb_read": bbRead },
    );
    return json({ read: true });
  }

  return json({ error: "Not found" }, 404);
}
