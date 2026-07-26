/**
 * routes.ts — REST API for the help system.
 *
 * GET    /api/v1/help              → { sections, topics }   (no auth)
 * GET    /api/v1/help/:topic       → { entry }              (no auth)
 * POST   /api/v1/help/:topic       → { entry }              (admin only)
 * DELETE /api/v1/help/:topic       → 204                    (admin only)
 */

import { registerPluginRoute, dbojs } from "@ursamu/mush";
import { helpRegistry, slugify } from "./registry.ts";
import { upsertEntry, deleteEntry } from "./providers/database.ts";
import { emitHelp } from "./hooks.ts";

/** Resolve whether a userId belongs to an admin or wizard.
 * flags is a space-separated string on the internal IDBOBJ type.
 */
async function isAdmin(userId: string): Promise<boolean> {
  const actor = await dbojs.queryOne({ id: userId });
  if (!actor) return false;
  // flags is a space-separated string on the internal IDBOBJ type
  const flagSet = new Set((actor.flags as unknown as string).split(" "));
  return flagSet.has("admin") || flagSet.has("wizard") || flagSet.has("superuser");
}

/**
 * Single prefix handler for /api/v1/help and /api/v1/help/<topic>.
 * dispatchPluginRoute matches by startsWith(prefix+"/"), so a separate
 * "/api/v1/help/:topic" registration never receives traffic — the bare
 * "/api/v1/help" handler always wins. Handle both paths here.
 */
registerPluginRoute("/api/v1/help", async (req, userId) => {
  const url = new URL(req.url);
  const rest = url.pathname
    .replace(/^\/api\/v1\/help\/?/, "")
    .replace(/\/+$/, "");
  const topic = rest ? slugify(rest) : "";

  // GET /api/v1/help — index (hide dark/hidden topics from listings)
  if (!topic && req.method === "GET") {
    const sections = await helpRegistry.sections();
    const topics = (await helpRegistry.all()).filter((e) => !e.hidden);
    return Response.json({ sections, topics });
  }

  if (!topic) {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405 },
    );
  }

  // GET /api/v1/help/<topic>
  if (req.method === "GET") {
    const entry = await helpRegistry.lookup(topic);
    if (!entry) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (url.searchParams.get("format") === "md") {
      return new Response(entry.content, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
        },
      });
    }
    return Response.json({ entry });
  }

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // POST /api/v1/help/<topic>
  if (req.method === "POST") {
    if (!(await isAdmin(userId))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: {
      content?: unknown;
      section?: unknown;
      tags?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (typeof body.content !== "string" || !body.content.trim()) {
      return Response.json(
        { error: "content is required" },
        { status: 400 },
      );
    }

    const section =
      typeof body.section === "string" && body.section
        ? body.section.toLowerCase()
        : (topic.includes("/") ? topic.split("/")[0] : "general");

    const tags =
      Array.isArray(body.tags) &&
        body.tags.every((t) => typeof t === "string")
        ? body.tags as string[]
        : [];

    const entry = await upsertEntry({
      name: topic,
      section,
      content: body.content.trim(),
      tags,
      source: "database",
      createdBy: userId,
    });

    emitHelp("help:register", {
      entry: {
        name: entry.name,
        section: entry.section,
        content: entry.content,
        source: "database",
        tags: entry.tags,
      },
    });

    return Response.json({ entry }, { status: 201 });
  }

  // DELETE /api/v1/help/<topic>
  if (req.method === "DELETE") {
    if (!(await isAdmin(userId))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const deleted = await deleteEntry(topic);
    if (!deleted) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return new Response(null, { status: 204 });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
});
