/**
 * REST API for the help system.
 *
 * GET    /api/v1/help              → { sections, topics }
 * GET    /api/v1/help/:topic       → { entry }
 * POST   /api/v1/help/:topic       → { entry }  (admin)
 * DELETE /api/v1/help/:topic       → 204        (admin, DB only)
 *
 * Staff-only topics (admin/wizard locks, staff/ paths, admin
 * sections, dark/hidden) are omitted for non-staff; direct GET
 * returns 404 (no existence leak).
 */

import { registerPluginRoute, dbojs } from "@ursamu/mush";
import { helpRegistry, slugify } from "./registry.ts";
import { upsertEntry, deleteEntry } from "./providers/database.ts";
import { emitHelp } from "./hooks.ts";
import {
  filterTopicsForViewer,
  isStaffOnlyEntry,
} from "./visibility.ts";

const STAFF = new Set([
  "admin",
  "wizard",
  "superuser",
  "staff",
]);

function flagSet(raw: unknown): Set<string> {
  if (raw instanceof Set) {
    return new Set([...raw].map((f) => String(f).toLowerCase()));
  }
  if (Array.isArray(raw)) {
    return new Set(raw.map((f) => String(f).toLowerCase()));
  }
  if (typeof raw === "string") {
    return new Set(
      raw.split(/[\s,|]+/).map((s) => s.toLowerCase().trim())
        .filter(Boolean),
    );
  }
  return new Set();
}

async function isStaff(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const actor = await dbojs.queryOne({ id: userId });
  if (!actor) return false;
  const s = flagSet(actor.flags);
  for (const f of STAFF) if (s.has(f)) return true;
  return false;
}

/**
 * Single prefix handler for /api/v1/help and nested topics.
 */
registerPluginRoute("/api/v1/help", async (req, userId) => {
  const url = new URL(req.url);
  const rest = url.pathname
    .replace(/^\/api\/v1\/help\/?/, "")
    .replace(/\/+$/, "");
  const topic = rest
    ? rest.split("/").map((p) => slugify(p)).filter(Boolean)
      .join("/")
    : "";

  const staff = await isStaff(userId);

  // GET /api/v1/help — index
  if (!topic && req.method === "GET") {
    const all = await helpRegistry.all();
    const topics = filterTopicsForViewer(all, staff)
      .sort((a, b) => a.name.localeCompare(b.name));
    const sections = [
      ...new Set(
        topics.map((e) => e.section).filter(Boolean),
      ),
    ].sort();
    return Response.json({ sections, topics, staff });
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
    // Fail closed for staff-only when viewer is not staff
    if (isStaffOnlyEntry(entry) && !staff) {
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

  // POST /api/v1/help/<topic> — create/update DB override
  if (req.method === "POST") {
    if (!staff) {
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
        : (topic.includes("/")
          ? topic.split("/")[0]
          : "general");

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
    if (!staff) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const deleted = await deleteEntry(topic);
    if (!deleted) {
      return Response.json(
        {
          error:
            "No database override for this topic " +
            "(file/command help cannot be deleted)",
        },
        { status: 404 },
      );
    }

    return new Response(null, { status: 204 });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
});
