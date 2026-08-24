import { dbojs } from "@ursamu/mush";
import { parseDateTime } from "./db.ts";
import { flagSetFromRaw, isStaffFlags } from "./helpers.ts";
import type { IGameEvent } from "./types.ts";
import {
  cancelRsvp,
  createEventFromStrings,
  deleteEvent,
  listEvents,
  listUpcomingEvents,
  resolveEvent,
  updateEventFields,
  upsertRsvp,
  withRsvpSummary,
} from "./service.ts";

// ─── helpers ─────────────────────────────────────────────────────────────────

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function isStaffUser(userId: string): Promise<boolean> {
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  return isStaffFlags(flagSetFromRaw(player.flags));
}

// ─── route handler ────────────────────────────────────────────────────────────
//
/**
 * GET    /api/v1/events                  — list events (filterable)
 * POST   /api/v1/events                  — create event (staff)
 * GET    /api/v1/events/upcoming         — shortcut: upcoming only
 * GET    /api/v1/events/:id              — single event + RSVP summary
 * PATCH  /api/v1/events/:id             — update event (staff)
 * DELETE /api/v1/events/:id             — delete event + RSVPs (staff)
 * GET    /api/v1/events/:id/rsvps        — list all RSVPs (staff sees all; players see summary)
 * POST   /api/v1/events/:id/rsvp        — RSVP or update RSVP
 * DELETE /api/v1/events/:id/rsvp        — cancel own RSVP
 */
export async function eventsRouteHandler(
  req: Request,
  userId: string | null,
): Promise<Response> {
  if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  const staff = await isStaffUser(userId);

  // ── GET /api/v1/events ───────────────────────────────────────────────────
  if (path === "/api/v1/events" && method === "GET") {
    const params = url.searchParams;
    const statusF = params.get("status");
    const tagF = params.get("tag");
    const fromF = params.get("from")
      ? parseInt(params.get("from")!, 10)
      : null;
    const toF = params.get("to") ? parseInt(params.get("to")!, 10) : null;
    const limit = Math.min(parseInt(params.get("limit") || "50", 10), 200);
    const offset = Math.max(parseInt(params.get("offset") || "0", 10), 0);

    const all = await listEvents({
      staff,
      status: statusF,
      tag: tagF,
      from: fromF,
      to: toF,
    });
    const page = all.slice(offset, offset + limit);
    const result = await Promise.all(
      page.map((e) => withRsvpSummary(e, userId)),
    );

    return jsonResponse({ total: all.length, events: result });
  }

  // ── GET /api/v1/events/upcoming ──────────────────────────────────────────
  if (path === "/api/v1/events/upcoming" && method === "GET") {
    const all = await listUpcomingEvents();
    const result = await Promise.all(
      all.map((e) => withRsvpSummary(e, userId)),
    );
    return jsonResponse(result);
  }

  // ── POST /api/v1/events ──────────────────────────────────────────────────
  if (path === "/api/v1/events" && method === "POST") {
    if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string"
      ? body.description.trim()
      : "";
    if (!title || !description || body.startTime == null) {
      return jsonResponse({
        error: "title, description, and startTime are required",
      }, 400);
    }

    const created = await createEventFromStrings({
      title,
      description,
      startTimeRaw: body.startTime as string | number,
      endTimeRaw: body.endTime as string | number | undefined,
      location: typeof body.location === "string"
        ? body.location.trim()
        : undefined,
      tags: Array.isArray(body.tags)
        ? (body.tags as string[]).map((t) => String(t).trim())
        : [],
      maxAttendees: typeof body.maxAttendees === "number"
        ? body.maxAttendees
        : 0,
      createdBy: userId,
    });
    if (!created.ok) {
      return jsonResponse({ error: created.error }, created.status);
    }
    return jsonResponse(created.value, 201);
  }

  // ── event by id/number sub-routes ────────────────────────────────────────
  const evMatch = path.match(/^\/api\/v1\/events\/([^/]+)(\/rsvps?)?$/);
  if (evMatch) {
    const idParam = evMatch[1];
    const sub = evMatch[2] || "";

    if (idParam === "upcoming") return jsonResponse({ error: "Not Found" }, 404);

    // ── GET /api/v1/events/:id ─────────────────────────────────────────────
    if (!sub && method === "GET") {
      const ev = await resolveEvent(idParam);
      if (!ev) return jsonResponse({ error: "Not found" }, 404);
      if (!staff && ev.status === "cancelled") {
        return jsonResponse({ error: "Not found" }, 404);
      }
      return jsonResponse(await withRsvpSummary(ev, userId));
    }

    // ── PATCH /api/v1/events/:id ───────────────────────────────────────────
    if (!sub && method === "PATCH") {
      if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

      const ev = await resolveEvent(idParam);
      if (!ev) return jsonResponse({ error: "Not found" }, 404);

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const ALLOWED = [
        "title",
        "description",
        "location",
        "status",
        "tags",
        "maxAttendees",
      ];
      const update: Partial<IGameEvent> = {};

      for (const field of ALLOWED) {
        if (field in body) {
          (update as Record<string, unknown>)[field] = body[field];
        }
      }

      if (typeof body.startTime === "string") {
        const t = parseDateTime(body.startTime);
        if (!t) return jsonResponse({ error: "Invalid startTime" }, 400);
        update.startTime = t;
      } else if (typeof body.startTime === "number") {
        update.startTime = body.startTime;
      }

      if (typeof body.endTime === "string") {
        const t = parseDateTime(body.endTime);
        if (!t) return jsonResponse({ error: "Invalid endTime" }, 400);
        update.endTime = t;
      } else if (typeof body.endTime === "number") {
        update.endTime = body.endTime;
      }

      const updated = await updateEventFields(ev, update);
      return jsonResponse(updated);
    }

    // ── DELETE /api/v1/events/:id ──────────────────────────────────────────
    if (!sub && method === "DELETE") {
      if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

      const ev = await resolveEvent(idParam);
      if (!ev) return jsonResponse({ error: "Not found" }, 404);

      await deleteEvent(ev);
      return jsonResponse({ deleted: true });
    }

    // ── GET /api/v1/events/:id/rsvps ──────────────────────────────────────
    if (sub === "/rsvps" && method === "GET") {
      const ev = await resolveEvent(idParam);
      if (!ev) return jsonResponse({ error: "Not found" }, 404);

      const summary = await withRsvpSummary(ev, userId);
      if (staff) {
        return jsonResponse(summary.rsvps);
      }
      return jsonResponse({
        attendingCount: summary.attendingCount,
        maybeCount: summary.maybeCount,
        myRsvp: summary.myRsvp,
        attendees: summary.attendees.map((a) => ({ name: a.name })),
      });
    }

    // ── POST /api/v1/events/:id/rsvp ──────────────────────────────────────
    if (sub === "/rsvp" && method === "POST") {
      const ev = await resolveEvent(idParam);
      if (!ev) return jsonResponse({ error: "Not found" }, 404);

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const rawStatus = typeof body.status === "string"
        ? body.status.trim()
        : "attending";
      const note = typeof body.note === "string" ? body.note.trim() : undefined;

      const result = await upsertRsvp({
        event: ev,
        playerId: userId,
        statusRaw: rawStatus,
        note,
      });
      if (!result.ok) {
        return jsonResponse({ error: result.error }, result.status);
      }
      return jsonResponse(
        result.value.rsvp,
        result.value.created ? 201 : 200,
      );
    }

    // ── DELETE /api/v1/events/:id/rsvp ────────────────────────────────────
    if (sub === "/rsvp" && method === "DELETE") {
      const ev = await resolveEvent(idParam);
      if (!ev) return jsonResponse({ error: "Not found" }, 404);

      const result = await cancelRsvp({ event: ev, playerId: userId });
      if (!result.ok) {
        return jsonResponse({ error: result.error }, result.status);
      }
      return jsonResponse({ deleted: true });
    }
  }

  return jsonResponse({ error: "Not Found" }, 404);
}
