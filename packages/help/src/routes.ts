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

registerPluginRoute("/api/v1/help", async (req, _userId) => {
  // Route: GET /api/v1/help
  if (req.method === "GET") {
    const sections = await helpRegistry.sections();
    const topics   = await helpRegistry.all();
    return Response.json({ sections, topics });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
});

registerPluginRoute("/api/v1/help/:topic", async (req, userId) => {
  const url    = new URL(req.url);
  // Extract topic from path: /api/v1/help/<topic>
  const topic  = slugify(url.pathname.replace(/^\/api\/v1\/help\//, ""));

  if (!topic) {
    return Response.json({ error: "Topic is required" }, { status: 400 });
  }

  // GET — public
  if (req.method === "GET") {
    const entry = await helpRegistry.lookup(topic);
    if (!entry) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    // Support raw markdown via ?format=md
    if (url.searchParams.get("format") === "md") {
      return new Response(entry.content, {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }
    return Response.json({ entry });
  }

  // Write operations require auth
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // POST — create/update (admin only)
  if (req.method === "POST") {
    if (!(await isAdmin(userId))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { content?: unknown; section?: unknown; tags?: unknown };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body.content !== "string" || !body.content.trim()) {
      return Response.json({ error: "content is required" }, { status: 400 });
    }

    const section = typeof body.section === "string" && body.section
      ? body.section.toLowerCase()
      : (topic.includes("/") ? topic.split("/")[0] : "general");

    const tags = Array.isArray(body.tags) && body.tags.every((t) => typeof t === "string")
      ? body.tags as string[]
      : [];

    const entry = await upsertEntry({
      name:      topic,
      section,
      content:   body.content.trim(),
      tags,
      source:    "database",
      createdBy: userId,
    });

    emitHelp("help:register", {
      entry: { name: entry.name, section: entry.section, content: entry.content, source: "database", tags: entry.tags },
    });

    return Response.json({ entry }, { status: 201 });
  }

  // DELETE (admin only)
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
