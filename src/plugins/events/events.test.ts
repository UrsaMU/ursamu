/**
 * src/plugins/events/events.test.ts
 *
 * Comprehensive tests for the events plugin (calendar system):
 *  - parseDateTime helper
 *  - REST API (eventsRouteHandler): auth, CRUD, filtering, pagination
 *  - RSVP: create, update, cancel, capacity enforcement
 *  - Permission: staff vs. player visibility of cancelled events
 */
import { assertEquals, assertExists } from "@std/assert";
import { eventsRouteHandler } from "./router.ts";
import { gameEvents, eventRsvps, parseDateTime } from "./db.ts";
import { dbojs, DBO } from "../../services/Database/database.ts";
import { counters } from "../../services/Database/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// Stable IDs to avoid collisions with other test suites
const STAFF_ID   = "evp_staff1";
const PLAYER_ID  = "evp_player1";
const PLAYER2_ID = "evp_player2";

// ─── helpers ─────────────────────────────────────────────────────────────────

function req(method: string, path: string, userId: string | null, body?: unknown): Promise<Response> {
  const r = new Request(`http://localhost${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return eventsRouteHandler(r, userId);
}

async function call<T>(
  method: string,
  path: string,
  userId: string | null,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const res = await req(method, path, userId, body);
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

async function cleanAll() {
  const evs = await gameEvents.find({});
  for (const ev of evs) {
    await gameEvents.delete({ id: ev.id }).catch(() => {});
    await eventRsvps.delete({ eventId: ev.id }).catch(() => {});
  }
  await counters.delete({ id: "eventid" }).catch(() => {});
  await dbojs.delete({ id: STAFF_ID }).catch(() => {});
  await dbojs.delete({ id: PLAYER_ID }).catch(() => {});
  await dbojs.delete({ id: PLAYER2_ID }).catch(() => {});
}

// ─── setup ───────────────────────────────────────────────────────────────────

Deno.test("EventsPlugin — setup fixtures", OPTS, async () => {
  await cleanAll();

  await dbojs.create({
    id: STAFF_ID,
    flags: "player connected admin",
    data: { name: "StaffUser", alias: "staffuser" },
  });
  await dbojs.create({
    id: PLAYER_ID,
    flags: "player connected",
    data: { name: "PlayerOne", alias: "playerone" },
  });
  await dbojs.create({
    id: PLAYER2_ID,
    flags: "player connected",
    data: { name: "PlayerTwo", alias: "playertwo" },
  });
});

// ─── parseDateTime ────────────────────────────────────────────────────────────

Deno.test("EventsPlugin — parseDateTime: YYYY-MM-DD", OPTS, () => {
  const t = parseDateTime("2027-06-15");
  assertExists(t);
  assertEquals(typeof t, "number");
});

Deno.test("EventsPlugin — parseDateTime: YYYY-MM-DD HH:MM", OPTS, () => {
  const t = parseDateTime("2027-06-15 14:30");
  assertExists(t);
  assertEquals(typeof t, "number");
});

Deno.test("EventsPlugin — parseDateTime: invalid string returns null", OPTS, () => {
  assertEquals(parseDateTime("not-a-date"), null);
  assertEquals(parseDateTime(""), null);
});

// ─── auth ─────────────────────────────────────────────────────────────────────

Deno.test("EventsPlugin — GET /api/v1/events 401 without userId", OPTS, async () => {
  const { status } = await call("GET", "/api/v1/events", null);
  assertEquals(status, 401);
});

// ─── create event (staff only) ────────────────────────────────────────────────

Deno.test("EventsPlugin — POST /api/v1/events 403 for player", OPTS, async () => {
  const { status } = await call("POST", "/api/v1/events", PLAYER_ID, {
    title: "Test",
    description: "Desc",
    startTime: "2027-06-15",
  });
  assertEquals(status, 403);
});

Deno.test("EventsPlugin — POST /api/v1/events 400 missing required fields", OPTS, async () => {
  const { status } = await call("POST", "/api/v1/events", STAFF_ID, {
    title: "Missing fields",
  });
  assertEquals(status, 400);
});

Deno.test("EventsPlugin — POST /api/v1/events creates event #1", OPTS, async () => {
  const { status, data } = await call<{ id: string; number: number; title: string }>(
    "POST", "/api/v1/events", STAFF_ID, {
      title: "Grand Tournament",
      description: "Annual PvP event",
      startTime: "2027-06-15",
      tags: ["pvp", "combat"],
      maxAttendees: 10,
    },
  );
  assertEquals(status, 201);
  assertEquals(data.title, "Grand Tournament");
  assertEquals(data.number, 1);
  assertExists(data.id);
});

Deno.test("EventsPlugin — POST /api/v1/events creates event #2", OPTS, async () => {
  const { status, data } = await call<{ number: number }>(
    "POST", "/api/v1/events", STAFF_ID, {
      title: "Story Night",
      description: "Collaborative storytelling",
      startTime: "2027-07-01",
    },
  );
  assertEquals(status, 201);
  assertEquals(data.number, 2);
});

// ─── list events ─────────────────────────────────────────────────────────────

Deno.test("EventsPlugin — GET /api/v1/events returns sorted list", OPTS, async () => {
  const { status, data } = await call<{ total: number; events: unknown[] }>(
    "GET", "/api/v1/events", PLAYER_ID,
  );
  assertEquals(status, 200);
  assertEquals(data.total, 2);
  assertEquals(data.events.length, 2);
});

Deno.test("EventsPlugin — GET /api/v1/events?limit=1 paginates", OPTS, async () => {
  const { data } = await call<{ total: number; events: unknown[] }>(
    "GET", "/api/v1/events?limit=1", PLAYER_ID,
  );
  assertEquals(data.total, 2);
  assertEquals(data.events.length, 1);
});

Deno.test("EventsPlugin — GET /api/v1/events?offset=1 returns second page", OPTS, async () => {
  const { data } = await call<{ total: number; events: Array<{ number: number }> }>(
    "GET", "/api/v1/events?offset=1", PLAYER_ID,
  );
  assertEquals(data.total, 2);
  assertEquals(data.events.length, 1);
  assertEquals(data.events[0].number, 2);
});

Deno.test("EventsPlugin — GET /api/v1/events?tag=pvp filters by tag", OPTS, async () => {
  const { data } = await call<{ total: number; events: unknown[] }>(
    "GET", "/api/v1/events?tag=pvp", PLAYER_ID,
  );
  assertEquals(data.total, 1);
});

// ─── upcoming shortcut ────────────────────────────────────────────────────────

Deno.test("EventsPlugin — GET /api/v1/events/upcoming returns array", OPTS, async () => {
  const { status, data } = await call<unknown[]>(
    "GET", "/api/v1/events/upcoming", PLAYER_ID,
  );
  assertEquals(status, 200);
  assertEquals(Array.isArray(data), true);
});

// ─── get single event ─────────────────────────────────────────────────────────

Deno.test("EventsPlugin — GET /api/v1/events/1 returns by number", OPTS, async () => {
  const { status, data } = await call<{ number: number; title: string; attendingCount: number }>(
    "GET", "/api/v1/events/1", PLAYER_ID,
  );
  assertEquals(status, 200);
  assertEquals(data.number, 1);
  assertEquals(data.title, "Grand Tournament");
  assertEquals(data.attendingCount, 0);
});

Deno.test("EventsPlugin — GET /api/v1/events/ev-1 returns by id string", OPTS, async () => {
  const { status, data } = await call<{ number: number }>(
    "GET", "/api/v1/events/ev-1", PLAYER_ID,
  );
  assertEquals(status, 200);
  assertEquals(data.number, 1);
});

Deno.test("EventsPlugin — GET /api/v1/events/999 returns 404", OPTS, async () => {
  const { status } = await call("GET", "/api/v1/events/999", PLAYER_ID);
  assertEquals(status, 404);
});

// ─── update event ─────────────────────────────────────────────────────────────

Deno.test("EventsPlugin — PATCH /api/v1/events/1 403 for player", OPTS, async () => {
  const { status } = await call("PATCH", "/api/v1/events/1", PLAYER_ID, { title: "Hacked" });
  assertEquals(status, 403);
});

Deno.test("EventsPlugin — PATCH /api/v1/events/1 updates fields", OPTS, async () => {
  const { status, data } = await call<{ title: string; location: string }>(
    "PATCH", "/api/v1/events/1", STAFF_ID, {
      title: "Grand Tournament Updated",
      location: "Arena",
    },
  );
  assertEquals(status, 200);
  assertEquals(data.title, "Grand Tournament Updated");
  assertEquals(data.location, "Arena");
});

// ─── RSVP ─────────────────────────────────────────────────────────────────────

Deno.test("EventsPlugin — POST /api/v1/events/1/rsvp attending (201)", OPTS, async () => {
  const { status, data } = await call<{ status: string; playerId: string }>(
    "POST", "/api/v1/events/1/rsvp", PLAYER_ID, { status: "attending" },
  );
  assertEquals(status, 201);
  assertEquals(data.status, "attending");
  assertEquals(data.playerId, PLAYER_ID);
});

Deno.test("EventsPlugin — GET /api/v1/events/1 shows attendingCount=1 + myRsvp", OPTS, async () => {
  const { data } = await call<{ attendingCount: number; myRsvp: string }>(
    "GET", "/api/v1/events/1", PLAYER_ID,
  );
  assertEquals(data.attendingCount, 1);
  assertEquals(data.myRsvp, "attending");
});

Deno.test("EventsPlugin — POST /api/v1/events/1/rsvp maybe for player2 (201)", OPTS, async () => {
  const { status, data } = await call<{ status: string }>(
    "POST", "/api/v1/events/1/rsvp", PLAYER2_ID, { status: "maybe" },
  );
  assertEquals(status, 201);
  assertEquals(data.status, "maybe");
});

Deno.test("EventsPlugin — GET /api/v1/events/1 shows maybeCount=1", OPTS, async () => {
  const { data } = await call<{ attendingCount: number; maybeCount: number }>(
    "GET", "/api/v1/events/1", PLAYER_ID,
  );
  assertEquals(data.attendingCount, 1);
  assertEquals(data.maybeCount, 1);
});

Deno.test("EventsPlugin — POST /api/v1/events/1/rsvp updates existing (200)", OPTS, async () => {
  const { status, data } = await call<{ status: string }>(
    "POST", "/api/v1/events/1/rsvp", PLAYER_ID, { status: "maybe" },
  );
  assertEquals(status, 200);
  assertEquals(data.status, "maybe");
});

Deno.test("EventsPlugin — POST /api/v1/events/1/rsvp invalid status 400", OPTS, async () => {
  const { status } = await call(
    "POST", "/api/v1/events/1/rsvp", PLAYER_ID, { status: "nope" },
  );
  assertEquals(status, 400);
});

// ─── RSVP list (staff vs player) ─────────────────────────────────────────────

Deno.test("EventsPlugin — GET /api/v1/events/1/rsvps — staff sees full array", OPTS, async () => {
  const { status, data } = await call<Array<{ playerId: string }>>(
    "GET", "/api/v1/events/1/rsvps", STAFF_ID,
  );
  assertEquals(status, 200);
  assertEquals(Array.isArray(data), true);
  assertEquals(data.length, 2);
});

Deno.test("EventsPlugin — GET /api/v1/events/1/rsvps — player sees summary object", OPTS, async () => {
  const { status, data } = await call<{ attendingCount?: number; myRsvp?: string }>(
    "GET", "/api/v1/events/1/rsvps", PLAYER_ID,
  );
  assertEquals(status, 200);
  assertEquals(Array.isArray(data), false);
  assertExists(data.attendingCount !== undefined);
});

// ─── cancel RSVP ─────────────────────────────────────────────────────────────

Deno.test("EventsPlugin — DELETE /api/v1/events/1/rsvp cancels own RSVP (200)", OPTS, async () => {
  const { status, data } = await call<{ deleted: boolean }>(
    "DELETE", "/api/v1/events/1/rsvp", PLAYER2_ID,
  );
  assertEquals(status, 200);
  assertEquals(data.deleted, true);
});

Deno.test("EventsPlugin — DELETE /api/v1/events/1/rsvp 404 when none exists", OPTS, async () => {
  const { status } = await call("DELETE", "/api/v1/events/1/rsvp", PLAYER2_ID);
  assertEquals(status, 404);
});

// ─── capacity enforcement ─────────────────────────────────────────────────────

Deno.test("EventsPlugin — capacity: create event with maxAttendees=1", OPTS, async () => {
  const { data } = await call<{ number: number }>(
    "POST", "/api/v1/events", STAFF_ID, {
      title: "Small Gathering",
      description: "Only 1 spot",
      startTime: "2027-08-01",
      maxAttendees: 1,
    },
  );
  assertEquals(data.number, 3);
});

Deno.test("EventsPlugin — capacity: first RSVP succeeds (201)", OPTS, async () => {
  const { status } = await call(
    "POST", "/api/v1/events/3/rsvp", PLAYER_ID, { status: "attending" },
  );
  assertEquals(status, 201);
});

Deno.test("EventsPlugin — capacity: second RSVP returns 409", OPTS, async () => {
  const { status } = await call(
    "POST", "/api/v1/events/3/rsvp", PLAYER2_ID, { status: "attending" },
  );
  assertEquals(status, 409);
});

Deno.test("EventsPlugin — capacity: updating own attending RSVP doesn't consume capacity", OPTS, async () => {
  // Switch player1 to maybe then back to attending — should succeed
  await call("POST", "/api/v1/events/3/rsvp", PLAYER_ID, { status: "maybe" });
  const { status } = await call(
    "POST", "/api/v1/events/3/rsvp", PLAYER_ID, { status: "attending" },
  );
  assertEquals(status, 200);
});

Deno.test("EventsPlugin — capacity freed after cancel: player2 can now attend", OPTS, async () => {
  await call("DELETE", "/api/v1/events/3/rsvp", PLAYER_ID);
  const { status } = await call(
    "POST", "/api/v1/events/3/rsvp", PLAYER2_ID, { status: "attending" },
  );
  assertEquals(status, 201);
});

// ─── cancelled event visibility ───────────────────────────────────────────────

Deno.test("EventsPlugin — PATCH status to cancelled", OPTS, async () => {
  const { status } = await call(
    "PATCH", "/api/v1/events/1", STAFF_ID, { status: "cancelled" },
  );
  assertEquals(status, 200);
});

Deno.test("EventsPlugin — cancelled event hidden from player list", OPTS, async () => {
  const { data } = await call<{ total: number }>("GET", "/api/v1/events", PLAYER_ID);
  // Events 2 and 3 visible; event 1 (cancelled) hidden
  assertEquals(data.total, 2);
});

Deno.test("EventsPlugin — cancelled event visible to staff in list", OPTS, async () => {
  const { data } = await call<{ total: number }>("GET", "/api/v1/events", STAFF_ID);
  assertEquals(data.total, 3);
});

Deno.test("EventsPlugin — player gets 404 for cancelled event", OPTS, async () => {
  const { status } = await call("GET", "/api/v1/events/1", PLAYER_ID);
  assertEquals(status, 404);
});

Deno.test("EventsPlugin — staff can view cancelled event", OPTS, async () => {
  const { status, data } = await call<{ status: string }>(
    "GET", "/api/v1/events/1", STAFF_ID,
  );
  assertEquals(status, 200);
  assertEquals(data.status, "cancelled");
});

Deno.test("EventsPlugin — RSVP to cancelled event returns 400", OPTS, async () => {
  const { status } = await call(
    "POST", "/api/v1/events/1/rsvp", PLAYER2_ID, { status: "attending" },
  );
  assertEquals(status, 400);
});

// ─── delete event ─────────────────────────────────────────────────────────────

Deno.test("EventsPlugin — DELETE /api/v1/events/1 403 for player", OPTS, async () => {
  const { status } = await call("DELETE", "/api/v1/events/1", PLAYER_ID);
  assertEquals(status, 403);
});

Deno.test("EventsPlugin — DELETE /api/v1/events/1 removes event and RSVPs", OPTS, async () => {
  const { status, data } = await call<{ deleted: boolean }>(
    "DELETE", "/api/v1/events/1", STAFF_ID,
  );
  assertEquals(status, 200);
  assertEquals(data.deleted, true);

  // RSVPs cascade-deleted
  const rsvps = await eventRsvps.find({ eventId: "ev-1" });
  assertEquals(rsvps.length, 0);
});

Deno.test("EventsPlugin — GET /api/v1/events/1 returns 404 after delete", OPTS, async () => {
  const { status } = await call("GET", "/api/v1/events/1", STAFF_ID);
  assertEquals(status, 404);
});

// ─── unknown route ────────────────────────────────────────────────────────────

Deno.test("EventsPlugin — unknown route returns 404", OPTS, async () => {
  const { status } = await call("GET", "/api/v1/events/1/unknown", PLAYER_ID);
  assertEquals(status, 404);
});

// ─── cleanup ─────────────────────────────────────────────────────────────────

Deno.test("EventsPlugin — cleanup", OPTS, async () => {
  await cleanAll();
  await DBO.close();
});
