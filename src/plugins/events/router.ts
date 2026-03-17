import { dbojs } from "../../services/Database/index.ts";
import { gameEvents, eventRsvps, getNextEventNumber, parseDateTime } from "./db.ts";
import type { IGameEvent, IEventRSVP } from "../../@types/IGameEvent.ts";

// ─── helpers ─────────────────────────────────────────────────────────────────

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function isStaffUser(userId: string): Promise<boolean> {
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  const f = player.flags || "";
  return f.includes("admin") || f.includes("wizard") || f.includes("superuser");
}

async function resolveEvent(idParam: string): Promise<IGameEvent | null> {
  const num = parseInt(idParam, 10);
  if (!isNaN(num)) return await gameEvents.queryOne({ number: num }) || null;
  return await gameEvents.queryOne({ id: idParam }) || null;
}

/** Attach attending/maybe/declined counts and the caller's own RSVP to an event. */
async function withRsvpSummary(ev: IGameEvent, userId?: string) {
  const all       = await eventRsvps.find({ eventId: ev.id });
  const attending = all.filter(r => r.status === "attending");
  const maybe     = all.filter(r => r.status === "maybe");
  const myRsvp    = userId ? all.find(r => r.playerId === userId) || null : null;
  return {
    ...ev,
    attendingCount: attending.length,
    maybeCount:     maybe.length,
    myRsvp:         myRsvp ? myRsvp.status : null,
  };
}

// ─── route handler ────────────────────────────────────────────────────────────
//
//  GET    /api/v1/events                  — list events (filterable)
//  POST   /api/v1/events                  — create event (staff)
//  GET    /api/v1/events/upcoming         — shortcut: upcoming only
//  GET    /api/v1/events/:id              — single event + RSVP summary
//  PATCH  /api/v1/events/:id             — update event (staff)
//  DELETE /api/v1/events/:id             — delete event + RSVPs (staff)
//  GET    /api/v1/events/:id/rsvps        — list all RSVPs (staff sees all; players see summary)
//  POST   /api/v1/events/:id/rsvp        — RSVP or update RSVP
//  DELETE /api/v1/events/:id/rsvp        — cancel own RSVP

export async function eventsRouteHandler(
  req: Request,
  userId: string | null
): Promise<Response> {
  if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method;
  const staff  = await isStaffUser(userId);

  // ── GET /api/v1/events ───────────────────────────────────────────────────
  if (path === "/api/v1/events" && method === "GET") {
    const params   = url.searchParams;
    const statusF  = params.get("status");
    const tagF     = params.get("tag");
    const fromF    = params.get("from") ? parseInt(params.get("from")!, 10) : null;
    const toF      = params.get("to")   ? parseInt(params.get("to")!,   10) : null;
    const limit    = Math.min(parseInt(params.get("limit")  || "50", 10), 200);
    const offset   = Math.max(parseInt(params.get("offset") || "0",  10), 0);

    let all = await gameEvents.find({});

    if (!staff) all = all.filter(e => e.status !== "cancelled");
    if (statusF) all = all.filter(e => e.status === statusF);
    if (tagF)    all = all.filter(e => e.tags.includes(tagF));
    if (fromF)   all = all.filter(e => e.startTime >= fromF);
    if (toF)     all = all.filter(e => e.startTime <= toF);

    all.sort((a, b) => a.startTime - b.startTime);
    const page = all.slice(offset, offset + limit);
    const result = await Promise.all(page.map(e => withRsvpSummary(e, userId)));

    return jsonResponse({ total: all.length, events: result });
  }

  // ── GET /api/v1/events/upcoming ──────────────────────────────────────────
  if (path === "/api/v1/events/upcoming" && method === "GET") {
    const now = Date.now();
    const all = (await gameEvents.find({}))
      .filter(e => (e.status === "upcoming" || e.status === "active") && e.startTime >= now)
      .sort((a, b) => a.startTime - b.startTime);
    const result = await Promise.all(all.map(e => withRsvpSummary(e, userId)));
    return jsonResponse(result);
  }

  // ── POST /api/v1/events ──────────────────────────────────────────────────
  if (path === "/api/v1/events" && method === "POST") {
    if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

    const title       = typeof body.title       === "string" ? body.title.trim()       : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const startDate   = typeof body.startTime   === "string" ? body.startTime.trim()   : "";

    if (!title || !description || !startDate) {
      return jsonResponse({ error: "title, description, and startTime are required" }, 400);
    }

    const startTime = typeof body.startTime === "number"
      ? body.startTime
      : parseDateTime(startDate);
    if (!startTime) return jsonResponse({ error: "Invalid startTime format" }, 400);

    const endTime = body.endTime
      ? (typeof body.endTime === "number" ? body.endTime : parseDateTime(String(body.endTime)))
      : undefined;

    const player = await dbojs.queryOne({ id: userId });
    const createdByName = (player && player.data?.name) || userId;

    const num = await getNextEventNumber();
    const now = Date.now();

    const ev: IGameEvent = {
      id:            `ev-${num}`,
      number:        num,
      title,
      description,
      location:      typeof body.location === "string" ? body.location.trim() : undefined,
      startTime,
      endTime:       endTime || undefined,
      createdBy:     userId,
      createdByName,
      status:        "upcoming",
      tags:          Array.isArray(body.tags) ? (body.tags as string[]).map(t => String(t).trim()) : [],
      maxAttendees:  typeof body.maxAttendees === "number" ? body.maxAttendees : 0,
      createdAt:     now,
      updatedAt:     now,
    };

    await gameEvents.create(ev);
    return jsonResponse(ev, 201);
  }

  // ── event by id/number sub-routes ────────────────────────────────────────
  const evMatch = path.match(/^\/api\/v1\/events\/([^/]+)(\/rsvps?)?$/);
  if (evMatch) {
    const idParam = evMatch[1];
    const sub     = evMatch[2] || "";

    // Skip the /upcoming special route (already handled above)
    if (idParam === "upcoming") return jsonResponse({ error: "Not Found" }, 404);

    // ── GET /api/v1/events/:id ─────────────────────────────────────────────
    if (!sub && method === "GET") {
      const ev = await resolveEvent(idParam);
      if (!ev) return jsonResponse({ error: "Not found" }, 404);

      if (!staff && ev.status === "cancelled") return jsonResponse({ error: "Not found" }, 404);

      const rsvps    = await eventRsvps.find({ eventId: ev.id });
      const myRsvp   = rsvps.find(r => r.playerId === userId) || null;
      const attending = rsvps.filter(r => r.status === "attending");
      const maybe    = rsvps.filter(r => r.status === "maybe");

      return jsonResponse({
        ...ev,
        attendingCount: attending.length,
        maybeCount:     maybe.length,
        myRsvp:         myRsvp ? myRsvp.status : null,
        // Full attendee list for display
        attendees:      attending.map(r => ({ id: r.playerId, name: r.playerName })),
        maybes:         maybe.map(r => ({ id: r.playerId, name: r.playerName })),
      });
    }

    // ── PATCH /api/v1/events/:id ───────────────────────────────────────────
    if (!sub && method === "PATCH") {
      if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

      const ev = await resolveEvent(idParam);
      if (!ev) return jsonResponse({ error: "Not found" }, 404);

      let body: Record<string, unknown>;
      try { body = await req.json(); }
      catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

      const ALLOWED = ["title", "description", "location", "status", "tags", "maxAttendees"];
      const update: Partial<IGameEvent> = { updatedAt: Date.now() };

      for (const field of ALLOWED) {
        if (field in body) (update as Record<string, unknown>)[field] = body[field];
      }

      // Parse datetime strings
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

      const updated: IGameEvent = { ...ev, ...update };
      await gameEvents.update({}, updated);
      return jsonResponse(updated);
    }

    // ── DELETE /api/v1/events/:id ──────────────────────────────────────────
    if (!sub && method === "DELETE") {
      if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

      const ev = await resolveEvent(idParam);
      if (!ev) return jsonResponse({ error: "Not found" }, 404);

      await gameEvents.delete({ id: ev.id });
      await eventRsvps.delete({ eventId: ev.id });
      return jsonResponse({ deleted: true });
    }

    // ── GET /api/v1/events/:id/rsvps ──────────────────────────────────────
    if (sub === "/rsvps" && method === "GET") {
      const ev = await resolveEvent(idParam);
      if (!ev) return jsonResponse({ error: "Not found" }, 404);

      const all = await eventRsvps.find({ eventId: ev.id });

      if (staff) {
        // Staff sees the full list
        return jsonResponse(all);
      } else {
        // Players see counts + their own status only
        const attending = all.filter(r => r.status === "attending");
        const maybe     = all.filter(r => r.status === "maybe");
        const myRsvp    = all.find(r => r.playerId === userId) || null;
        return jsonResponse({
          attendingCount: attending.length,
          maybeCount:     maybe.length,
          myRsvp:         myRsvp ? myRsvp.status : null,
          attendees:      attending.map(r => ({ name: r.playerName })),
        });
      }
    }

    // ── POST /api/v1/events/:id/rsvp ──────────────────────────────────────
    if (sub === "/rsvp" && method === "POST") {
      const ev = await resolveEvent(idParam);
      if (!ev) return jsonResponse({ error: "Not found" }, 404);
      if (ev.status === "cancelled") return jsonResponse({ error: "Event is cancelled" }, 400);
      if (ev.status === "completed") return jsonResponse({ error: "Event has already occurred" }, 400);

      let body: Record<string, unknown>;
      try { body = await req.json(); }
      catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

      const rawStatus = typeof body.status === "string" ? body.status.trim().toLowerCase() : "attending";
      const VALID_STATUSES = ["attending", "maybe", "declined"];
      if (!VALID_STATUSES.includes(rawStatus)) {
        return jsonResponse({ error: "status must be attending, maybe, or declined" }, 400);
      }
      const status = rawStatus as IEventRSVP["status"];
      const note   = typeof body.note === "string" ? body.note.trim() : undefined;

      // Capacity check
      if (status === "attending" && ev.maxAttendees > 0) {
        const attending = await eventRsvps.find({ eventId: ev.id, status: "attending" });
        const myRsvp    = await eventRsvps.queryOne({ eventId: ev.id, playerId: userId });
        const alreadyAttending = myRsvp?.status === "attending";
        if (!alreadyAttending && attending.length >= ev.maxAttendees) {
          return jsonResponse({ error: "Event is at capacity" }, 409);
        }
      }

      const player     = await dbojs.queryOne({ id: userId });
      const playerName = (player && player.data?.name) || userId;

      const existing = await eventRsvps.queryOne({ eventId: ev.id, playerId: userId });
      if (existing) {
        const updated = { ...existing, status, note, createdAt: existing.createdAt };
        await eventRsvps.update({}, updated);
        return jsonResponse(updated);
      }

      const rsvp: IEventRSVP = {
        id:         crypto.randomUUID(),
        eventId:    ev.id,
        playerId:   userId,
        playerName,
        status,
        note,
        createdAt:  Date.now(),
      };
      await eventRsvps.create(rsvp);
      return jsonResponse(rsvp, 201);
    }

    // ── DELETE /api/v1/events/:id/rsvp ────────────────────────────────────
    if (sub === "/rsvp" && method === "DELETE") {
      const ev = await resolveEvent(idParam);
      if (!ev) return jsonResponse({ error: "Not found" }, 404);

      const existing = await eventRsvps.queryOne({ eventId: ev.id, playerId: userId });
      if (!existing) return jsonResponse({ error: "No RSVP to cancel" }, 404);

      await eventRsvps.delete({ id: existing.id });
      return jsonResponse({ deleted: true });
    }
  }

  return jsonResponse({ error: "Not Found" }, 404);
}
