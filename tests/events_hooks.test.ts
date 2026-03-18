/**
 * tests/events_hooks.test.ts
 *
 * Tests for the EventHooks registry (src/plugins/events/hooks.ts).
 * Covers: on/emit for all 7 events, off, error isolation, async handlers,
 * and emit with no handlers.
 */
import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { eventHooks } from "../src/plugins/events/hooks.ts";
import type { IGameEvent, IEventRSVP } from "../src/@types/IGameEvent.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ─── sample payloads ──────────────────────────────────────────────────────────

const SAMPLE_EVENT: IGameEvent = {
  id: "ev-test1",
  number: 1,
  title: "Test Event",
  description: "A test event.",
  startTime: Date.now() + 86400000,
  createdBy: "p1",
  createdByName: "Alice",
  status: "upcoming",
  tags: ["test"],
  maxAttendees: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const SAMPLE_RSVP: IEventRSVP = {
  id: "rsvp-test1",
  eventId: "ev-test1",
  playerId: "p2",
  playerName: "Bob",
  status: "attending",
  createdAt: Date.now(),
};

// ─── event:created ────────────────────────────────────────────────────────────

Deno.test("EventHooks — event:created: on + emit delivers payload", OPTS, async () => {
  const received: IGameEvent[] = [];
  const handler = (e: IGameEvent) => { received.push(e); };
  eventHooks.on("event:created", handler);

  await eventHooks.emit("event:created", SAMPLE_EVENT);

  eventHooks.off("event:created", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].title, "Test Event");
  assertEquals(received[0].id, "ev-test1");
});

Deno.test("EventHooks — event:created: off removes handler", OPTS, async () => {
  const received: IGameEvent[] = [];
  const handler = (e: IGameEvent) => { received.push(e); };
  eventHooks.on("event:created", handler);
  eventHooks.off("event:created", handler);

  await eventHooks.emit("event:created", SAMPLE_EVENT);

  assertEquals(received.length, 0);
});

Deno.test("EventHooks — event:created: error isolation", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("created bad"); };
  const good = () => { calls.push("created-good"); };
  eventHooks.on("event:created", bad);
  eventHooks.on("event:created", good);

  await eventHooks.emit("event:created", SAMPLE_EVENT);

  eventHooks.off("event:created", bad);
  eventHooks.off("event:created", good);
  assertEquals(calls, ["created-good"]);
});

Deno.test("EventHooks — event:created: async handler is awaited", OPTS, async () => {
  const calls: string[] = [];
  const handler = async (e: IGameEvent) => {
    await Promise.resolve();
    calls.push(e.title);
  };
  eventHooks.on("event:created", handler);

  await eventHooks.emit("event:created", SAMPLE_EVENT);

  eventHooks.off("event:created", handler);
  assertEquals(calls, ["Test Event"]);
});

Deno.test("EventHooks — event:created: emit with no handlers is safe", OPTS, async () => {
  await eventHooks.emit("event:created", SAMPLE_EVENT);
});

// ─── event:updated ────────────────────────────────────────────────────────────

Deno.test("EventHooks — event:updated: on + emit delivers payload", OPTS, async () => {
  const received: IGameEvent[] = [];
  const handler = (e: IGameEvent) => { received.push(e); };
  eventHooks.on("event:updated", handler);

  const updated = { ...SAMPLE_EVENT, title: "Updated Title" };
  await eventHooks.emit("event:updated", updated);

  eventHooks.off("event:updated", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].title, "Updated Title");
});

Deno.test("EventHooks — event:updated: off removes handler", OPTS, async () => {
  const received: IGameEvent[] = [];
  const handler = (e: IGameEvent) => { received.push(e); };
  eventHooks.on("event:updated", handler);
  eventHooks.off("event:updated", handler);

  await eventHooks.emit("event:updated", SAMPLE_EVENT);

  assertEquals(received.length, 0);
});

Deno.test("EventHooks — event:updated: error isolation", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("updated bad"); };
  const good = () => { calls.push("updated-good"); };
  eventHooks.on("event:updated", bad);
  eventHooks.on("event:updated", good);

  await eventHooks.emit("event:updated", SAMPLE_EVENT);

  eventHooks.off("event:updated", bad);
  eventHooks.off("event:updated", good);
  assertEquals(calls, ["updated-good"]);
});

// ─── event:cancelled ──────────────────────────────────────────────────────────

Deno.test("EventHooks — event:cancelled: on + emit delivers payload", OPTS, async () => {
  const received: IGameEvent[] = [];
  const handler = (e: IGameEvent) => { received.push(e); };
  eventHooks.on("event:cancelled", handler);

  const cancelled = { ...SAMPLE_EVENT, status: "cancelled" as const };
  await eventHooks.emit("event:cancelled", cancelled);

  eventHooks.off("event:cancelled", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].status, "cancelled");
});

Deno.test("EventHooks — event:cancelled: error isolation", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("cancelled bad"); };
  const good = () => { calls.push("cancelled-good"); };
  eventHooks.on("event:cancelled", bad);
  eventHooks.on("event:cancelled", good);

  await eventHooks.emit("event:cancelled", SAMPLE_EVENT);

  eventHooks.off("event:cancelled", bad);
  eventHooks.off("event:cancelled", good);
  assertEquals(calls, ["cancelled-good"]);
});

Deno.test("EventHooks — event:cancelled: async handler is awaited", OPTS, async () => {
  const calls: string[] = [];
  const handler = async (e: IGameEvent) => {
    await Promise.resolve();
    calls.push(e.id);
  };
  eventHooks.on("event:cancelled", handler);

  await eventHooks.emit("event:cancelled", SAMPLE_EVENT);

  eventHooks.off("event:cancelled", handler);
  assertEquals(calls, ["ev-test1"]);
});

// ─── event:completed ──────────────────────────────────────────────────────────

Deno.test("EventHooks — event:completed: on + emit delivers payload", OPTS, async () => {
  const received: IGameEvent[] = [];
  const handler = (e: IGameEvent) => { received.push(e); };
  eventHooks.on("event:completed", handler);

  const completed = { ...SAMPLE_EVENT, status: "completed" as const };
  await eventHooks.emit("event:completed", completed);

  eventHooks.off("event:completed", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].status, "completed");
});

Deno.test("EventHooks — event:completed: off removes handler", OPTS, async () => {
  const received: IGameEvent[] = [];
  const handler = (e: IGameEvent) => { received.push(e); };
  eventHooks.on("event:completed", handler);
  eventHooks.off("event:completed", handler);

  await eventHooks.emit("event:completed", SAMPLE_EVENT);

  assertEquals(received.length, 0);
});

Deno.test("EventHooks — event:completed: error isolation", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("completed bad"); };
  const good = () => { calls.push("completed-good"); };
  eventHooks.on("event:completed", bad);
  eventHooks.on("event:completed", good);

  await eventHooks.emit("event:completed", SAMPLE_EVENT);

  eventHooks.off("event:completed", bad);
  eventHooks.off("event:completed", good);
  assertEquals(calls, ["completed-good"]);
});

// ─── event:deleted ────────────────────────────────────────────────────────────

Deno.test("EventHooks — event:deleted: on + emit delivers payload", OPTS, async () => {
  const received: IGameEvent[] = [];
  const handler = (e: IGameEvent) => { received.push(e); };
  eventHooks.on("event:deleted", handler);

  await eventHooks.emit("event:deleted", SAMPLE_EVENT);

  eventHooks.off("event:deleted", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].id, "ev-test1");
});

Deno.test("EventHooks — event:deleted: error isolation", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("deleted bad"); };
  const good = () => { calls.push("deleted-good"); };
  eventHooks.on("event:deleted", bad);
  eventHooks.on("event:deleted", good);

  await eventHooks.emit("event:deleted", SAMPLE_EVENT);

  eventHooks.off("event:deleted", bad);
  eventHooks.off("event:deleted", good);
  assertEquals(calls, ["deleted-good"]);
});

Deno.test("EventHooks — event:deleted: emit with no handlers is safe", OPTS, async () => {
  await eventHooks.emit("event:deleted", SAMPLE_EVENT);
});

// ─── event:rsvp ───────────────────────────────────────────────────────────────

Deno.test("EventHooks — event:rsvp: on + emit delivers both event and rsvp", OPTS, async () => {
  const receivedEvents: IGameEvent[] = [];
  const receivedRsvps: IEventRSVP[] = [];
  const handler = (e: IGameEvent, r: IEventRSVP) => {
    receivedEvents.push(e);
    receivedRsvps.push(r);
  };
  eventHooks.on("event:rsvp", handler);

  await eventHooks.emit("event:rsvp", SAMPLE_EVENT, SAMPLE_RSVP);

  eventHooks.off("event:rsvp", handler);
  assertEquals(receivedEvents.length, 1);
  assertEquals(receivedRsvps.length, 1);
  assertEquals(receivedEvents[0].id, "ev-test1");
  assertEquals(receivedRsvps[0].playerName, "Bob");
  assertEquals(receivedRsvps[0].status, "attending");
});

Deno.test("EventHooks — event:rsvp: off removes handler", OPTS, async () => {
  const calls: string[] = [];
  const handler = () => { calls.push("rsvp"); };
  eventHooks.on("event:rsvp", handler);
  eventHooks.off("event:rsvp", handler);

  await eventHooks.emit("event:rsvp", SAMPLE_EVENT, SAMPLE_RSVP);

  assertEquals(calls.length, 0);
});

Deno.test("EventHooks — event:rsvp: error isolation", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("rsvp bad"); };
  const good = () => { calls.push("rsvp-good"); };
  eventHooks.on("event:rsvp", bad);
  eventHooks.on("event:rsvp", good);

  await eventHooks.emit("event:rsvp", SAMPLE_EVENT, SAMPLE_RSVP);

  eventHooks.off("event:rsvp", bad);
  eventHooks.off("event:rsvp", good);
  assertEquals(calls, ["rsvp-good"]);
});

Deno.test("EventHooks — event:rsvp: async handler is awaited", OPTS, async () => {
  const calls: string[] = [];
  const handler = async (_e: IGameEvent, r: IEventRSVP) => {
    await Promise.resolve();
    calls.push(r.playerName);
  };
  eventHooks.on("event:rsvp", handler);

  await eventHooks.emit("event:rsvp", SAMPLE_EVENT, SAMPLE_RSVP);

  eventHooks.off("event:rsvp", handler);
  assertEquals(calls, ["Bob"]);
});

// ─── event:rsvp-cancelled ─────────────────────────────────────────────────────

Deno.test("EventHooks — event:rsvp-cancelled: on + emit delivers both args", OPTS, async () => {
  const receivedEvents: IGameEvent[] = [];
  const receivedRsvps: IEventRSVP[] = [];
  const handler = (e: IGameEvent, r: IEventRSVP) => {
    receivedEvents.push(e);
    receivedRsvps.push(r);
  };
  eventHooks.on("event:rsvp-cancelled", handler);

  await eventHooks.emit("event:rsvp-cancelled", SAMPLE_EVENT, SAMPLE_RSVP);

  eventHooks.off("event:rsvp-cancelled", handler);
  assertEquals(receivedEvents.length, 1);
  assertEquals(receivedRsvps.length, 1);
  assertEquals(receivedRsvps[0].playerId, "p2");
});

Deno.test("EventHooks — event:rsvp-cancelled: off removes handler", OPTS, async () => {
  const calls: string[] = [];
  const handler = () => { calls.push("rsvp-cancelled"); };
  eventHooks.on("event:rsvp-cancelled", handler);
  eventHooks.off("event:rsvp-cancelled", handler);

  await eventHooks.emit("event:rsvp-cancelled", SAMPLE_EVENT, SAMPLE_RSVP);

  assertEquals(calls.length, 0);
});

Deno.test("EventHooks — event:rsvp-cancelled: error isolation", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("rsvp-cancelled bad"); };
  const good = () => { calls.push("rsvp-cancelled-good"); };
  eventHooks.on("event:rsvp-cancelled", bad);
  eventHooks.on("event:rsvp-cancelled", good);

  await eventHooks.emit("event:rsvp-cancelled", SAMPLE_EVENT, SAMPLE_RSVP);

  eventHooks.off("event:rsvp-cancelled", bad);
  eventHooks.off("event:rsvp-cancelled", good);
  assertEquals(calls, ["rsvp-cancelled-good"]);
});

Deno.test("EventHooks — event:rsvp-cancelled: async handler is awaited", OPTS, async () => {
  const calls: string[] = [];
  const handler = async (e: IGameEvent, _r: IEventRSVP) => {
    await Promise.resolve();
    calls.push(e.title);
  };
  eventHooks.on("event:rsvp-cancelled", handler);

  await eventHooks.emit("event:rsvp-cancelled", SAMPLE_EVENT, SAMPLE_RSVP);

  eventHooks.off("event:rsvp-cancelled", handler);
  assertEquals(calls, ["Test Event"]);
});

Deno.test("EventHooks — event:rsvp-cancelled: emit with no handlers is safe", OPTS, async () => {
  await eventHooks.emit("event:rsvp-cancelled", SAMPLE_EVENT, SAMPLE_RSVP);
});
