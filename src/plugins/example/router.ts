import { dbojs } from "../../services/Database/index.ts";
import { notes } from "./db.ts";

// ─── helpers ─────────────────────────────────────────────────────────────────

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function isStaff(userId: string): Promise<boolean> {
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  const f = player.flags || "";
  return f.includes("admin") || f.includes("wizard") || f.includes("superuser");
}

// ─── route handler ────────────────────────────────────────────────────────────
//
// Routes registered under the prefix "/api/v1/example":
//
//   GET  /api/v1/example/notes          — list current user's notes
//   POST /api/v1/example/notes          — create a note
//   DELETE /api/v1/example/notes/:id   — delete a note (owner or staff)

export async function exampleRouteHandler(
  req: Request,
  userId: string | null
): Promise<Response> {
  if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method;

  // ── GET /api/v1/example/notes ────────────────────────────────────────────
  if (path === "/api/v1/example/notes" && method === "GET") {
    const staff = await isStaff(userId);
    const all   = staff
      ? await notes.find({})
      : await notes.find({ author: userId });
    return jsonResponse(all);
  }

  // ── POST /api/v1/example/notes ───────────────────────────────────────────
  if (path === "/api/v1/example/notes" && method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return jsonResponse({ error: "text is required" }, 400);

    const player     = await dbojs.queryOne({ id: userId });
    const authorName = (player && player.data?.name) || userId;

    const note = await notes.create({
      id:         `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      author:     userId,
      authorName,
      text,
      createdAt:  Date.now(),
    });

    return jsonResponse(note, 201);
  }

  // ── DELETE /api/v1/example/notes/:id ─────────────────────────────────────
  const deleteMatch = path.match(/^\/api\/v1\/example\/notes\/(.+)$/);
  if (deleteMatch && method === "DELETE") {
    const noteId = deleteMatch[1];
    const note   = await notes.queryOne({ id: noteId });
    if (!note) return jsonResponse({ error: "Not found" }, 404);

    const staff = await isStaff(userId);
    if (note.author !== userId && !staff) return jsonResponse({ error: "Forbidden" }, 403);

    await notes.delete({ id: noteId });
    return jsonResponse({ deleted: true });
  }

  return jsonResponse({ error: "Not Found" }, 404);
}
