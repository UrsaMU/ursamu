import { assertEquals, assertExists } from "@std/assert";
import { formatDateTime, parseDateTime } from "../src/db.ts";
import {
  buildEventFieldUpdate,
  buildNewEvent,
  buildNewRsvp,
  filterUpcoming,
  filterVisibleEvents,
  formatCapacity,
  groupByEventId,
  isAtCapacity,
  isStaffFlags,
  isValidEventStatus,
  parseCreateArg,
  parseRsvpStatus,
  rsvpBlockReason,
  sortEventsByStart,
  statusChangeHook,
  summarizeRsvps,
} from "../src/helpers.ts";
import type { IEventRSVP, IGameEvent } from "../src/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function sampleEvent(
  overrides: Partial<IGameEvent> = {},
): IGameEvent {
  return {
    id: "ev-1",
    number: 1,
    title: "Gala",
    description: "Party",
    startTime: Date.parse("2030-01-15T19:00:00"),
    createdBy: "p1",
    createdByName: "Ada",
    status: "upcoming",
    tags: [],
    maxAttendees: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

// ─── parseDateTime / formatDateTime ───────────────────────────────────────────

Deno.test("parseDateTime accepts YYYY-MM-DD", OPTS, () => {
  const t = parseDateTime("2030-06-01");
  assertExists(t);
  // Date-only strings parse as UTC midnight; use UTC getters for stability.
  const d = new Date(t!);
  assertEquals(d.getUTCFullYear(), 2030);
  assertEquals(d.getUTCMonth(), 5);
  assertEquals(d.getUTCDate(), 1);
});

Deno.test("parseDateTime accepts YYYY-MM-DD HH:MM", OPTS, () => {
  const t = parseDateTime("2030-06-01 19:30");
  assertExists(t);
  // Local parse via space→T; hour is environment-local.
  assertEquals(typeof t, "number");
  assertEquals(Number.isFinite(t), true);
});

Deno.test("parseDateTime rejects garbage", OPTS, () => {
  assertEquals(parseDateTime(""), null);
  assertEquals(parseDateTime("not-a-date"), null);
  assertEquals(parseDateTime("99/99/99"), null);
});

Deno.test("formatDateTime returns non-empty locale string", OPTS, () => {
  const s = formatDateTime(Date.parse("2030-01-15T12:00:00Z"));
  assertEquals(s.length > 0, true);
});

// ─── staff / status ───────────────────────────────────────────────────────────

Deno.test("isStaffFlags recognizes admin/wizard/superuser", OPTS, () => {
  assertEquals(isStaffFlags(new Set(["player"])), false);
  assertEquals(isStaffFlags(new Set(["admin"])), true);
  assertEquals(isStaffFlags(new Set(["wizard"])), true);
  assertEquals(isStaffFlags(new Set(["superuser"])), true);
  // DBO often stores flags as a string
  assertEquals(isStaffFlags("player connected superuser"), true);
  assertEquals(isStaffFlags("player connected"), false);
  assertEquals(isStaffFlags(["admin", "player"]), true);
});

Deno.test("isValidEventStatus", OPTS, () => {
  assertEquals(isValidEventStatus("upcoming"), true);
  assertEquals(isValidEventStatus("active"), true);
  assertEquals(isValidEventStatus("bogus"), false);
});

// ─── RSVP parse ───────────────────────────────────────────────────────────────

Deno.test("parseRsvpStatus aliases", OPTS, () => {
  assertEquals(parseRsvpStatus("attending"), "attending");
  assertEquals(parseRsvpStatus("yes"), "attending");
  assertEquals(parseRsvpStatus("maybe"), "maybe");
  assertEquals(parseRsvpStatus("decline"), "declined");
  assertEquals(parseRsvpStatus("no"), "declined");
  assertEquals(parseRsvpStatus("nope"), null);
});

// ─── capacity ─────────────────────────────────────────────────────────────────

Deno.test("isAtCapacity unlimited when max is 0", OPTS, () => {
  assertEquals(isAtCapacity(0, 999, false), false);
});

Deno.test("isAtCapacity blocks new attendees at max", OPTS, () => {
  assertEquals(isAtCapacity(2, 2, false), true);
  assertEquals(isAtCapacity(2, 1, false), false);
});

Deno.test("isAtCapacity allows already-attending to re-confirm", OPTS, () => {
  assertEquals(isAtCapacity(2, 2, true), false);
});

Deno.test("formatCapacity", OPTS, () => {
  assertEquals(formatCapacity(3, 0), "3");
  assertEquals(formatCapacity(3, 10), "3/10");
});

Deno.test("rsvpBlockReason cancelled/completed/capacity", OPTS, () => {
  assertEquals(
    rsvpBlockReason(sampleEvent({ status: "cancelled" }), "attending", 0, false),
    "cancelled",
  );
  assertEquals(
    rsvpBlockReason(sampleEvent({ status: "completed" }), "attending", 0, false),
    "completed",
  );
  assertEquals(
    rsvpBlockReason(
      sampleEvent({ maxAttendees: 1 }),
      "attending",
      1,
      false,
    ),
    "at_capacity",
  );
  assertEquals(
    rsvpBlockReason(
      sampleEvent({ maxAttendees: 1 }),
      "maybe",
      1,
      false,
    ),
    null,
  );
  assertEquals(
    rsvpBlockReason(sampleEvent(), "attending", 0, false),
    null,
  );
});

// ─── filters / sort ───────────────────────────────────────────────────────────

Deno.test("filterVisibleEvents hides cancelled from non-staff", OPTS, () => {
  const list = [
    sampleEvent({ number: 1, status: "upcoming" }),
    sampleEvent({ id: "ev-2", number: 2, status: "cancelled" }),
  ];
  assertEquals(filterVisibleEvents(list, false).length, 1);
  assertEquals(filterVisibleEvents(list, true).length, 2);
});

Deno.test("sortEventsByStart then number", OPTS, () => {
  const a = sampleEvent({
    id: "a",
    number: 2,
    startTime: 200,
  });
  const b = sampleEvent({
    id: "b",
    number: 1,
    startTime: 100,
  });
  const c = sampleEvent({
    id: "c",
    number: 3,
    startTime: 100,
  });
  const sorted = sortEventsByStart([a, c, b]);
  assertEquals(sorted.map((e) => e.id), ["b", "c", "a"]);
});

Deno.test("filterUpcoming keeps future upcoming/active only", OPTS, () => {
  const now = 1_000_000;
  const list = [
    sampleEvent({
      id: "past",
      status: "upcoming",
      startTime: now - 1,
    }),
    sampleEvent({
      id: "future",
      status: "upcoming",
      startTime: now + 1,
    }),
    sampleEvent({
      id: "done",
      status: "completed",
      startTime: now + 1,
    }),
    sampleEvent({
      id: "live",
      status: "active",
      startTime: now,
    }),
  ];
  const out = filterUpcoming(list, now);
  assertEquals(out.map((e) => e.id).sort(), ["future", "live"]);
});

// ─── RSVP summary / group ─────────────────────────────────────────────────────

Deno.test("summarizeRsvps counts by status", OPTS, () => {
  const rsvps: IEventRSVP[] = [
    {
      id: "1",
      eventId: "e",
      playerId: "a",
      playerName: "A",
      status: "attending",
      createdAt: 1,
    },
    {
      id: "2",
      eventId: "e",
      playerId: "b",
      playerName: "B",
      status: "maybe",
      createdAt: 1,
    },
    {
      id: "3",
      eventId: "e",
      playerId: "c",
      playerName: "C",
      status: "declined",
      createdAt: 1,
    },
    {
      id: "4",
      eventId: "e",
      playerId: "d",
      playerName: "D",
      status: "attending",
      createdAt: 1,
    },
  ];
  const s = summarizeRsvps(rsvps);
  assertEquals(s.attendingCount, 2);
  assertEquals(s.maybeCount, 1);
  assertEquals(s.declinedCount, 1);
});

Deno.test("groupByEventId", OPTS, () => {
  const map = groupByEventId([
    { eventId: "a", n: 1 },
    { eventId: "b", n: 2 },
    { eventId: "a", n: 3 },
  ]);
  assertEquals(map.get("a")?.length, 2);
  assertEquals(map.get("b")?.length, 1);
});

// ─── field edit / create parse ────────────────────────────────────────────────

Deno.test("buildEventFieldUpdate title and tags", OPTS, () => {
  const t = buildEventFieldUpdate("title", "  New  ");
  assertEquals(t.ok, true);
  if (t.ok) assertEquals(t.update.title, "New");

  const tags = buildEventFieldUpdate("tags", "a, b , ,c");
  assertEquals(tags.ok, true);
  if (tags.ok) assertEquals(tags.update.tags, ["a", "b", "c"]);
});

Deno.test("buildEventFieldUpdate rejects empty title and bad max", OPTS, () => {
  assertEquals(buildEventFieldUpdate("title", "  ").ok, false);
  assertEquals(buildEventFieldUpdate("maxattendees", "-1").ok, false);
  assertEquals(buildEventFieldUpdate("nope", "x").ok, false);
});

Deno.test("buildEventFieldUpdate starttime", OPTS, () => {
  const r = buildEventFieldUpdate("starttime", "2030-12-25 18:00");
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(typeof r.update.startTime, "number");
});

Deno.test("parseCreateArg happy path", OPTS, () => {
  const r = parseCreateArg("Summer Gala=2030-08-01 19:00/Big party");
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.title, "Summer Gala");
    assertEquals(r.description, "Big party");
    assertEquals(typeof r.startTime, "number");
  }
});

Deno.test("parseCreateArg missing pieces", OPTS, () => {
  assertEquals(parseCreateArg("noequals").ok, false);
  assertEquals(parseCreateArg("t=nodate").ok, false);
  assertEquals(parseCreateArg("=2030-01-01/d").ok, false);
});

// ─── statusChangeHook ─────────────────────────────────────────────────────────

Deno.test("statusChangeHook maps cancelled and completed", OPTS, () => {
  assertEquals(statusChangeHook("upcoming", "cancelled"), "event:cancelled");
  assertEquals(statusChangeHook("active", "completed"), "event:completed");
  assertEquals(statusChangeHook("upcoming", "active"), "event:updated");
  assertEquals(statusChangeHook("upcoming", "upcoming"), "event:updated");
});

// ─── factories ────────────────────────────────────────────────────────────────

Deno.test("buildNewEvent defaults", OPTS, () => {
  const ev = buildNewEvent({
    number: 7,
    title: "T",
    description: "D",
    startTime: 123,
    createdBy: "p",
    createdByName: "P",
    now: 999,
  });
  assertEquals(ev.id, "ev-7");
  assertEquals(ev.number, 7);
  assertEquals(ev.status, "upcoming");
  assertEquals(ev.maxAttendees, 0);
  assertEquals(ev.tags, []);
  assertEquals(ev.createdAt, 999);
  assertEquals(ev.updatedAt, 999);
});

Deno.test("buildNewRsvp", OPTS, () => {
  const r = buildNewRsvp({
    eventId: "ev-1",
    playerId: "p",
    playerName: "P",
    status: "maybe",
    id: "fixed-id",
    now: 42,
  });
  assertEquals(r.id, "fixed-id");
  assertEquals(r.status, "maybe");
  assertEquals(r.createdAt, 42);
});
