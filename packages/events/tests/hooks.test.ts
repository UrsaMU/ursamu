import { assertEquals } from "@std/assert";
import { eventHooks } from "../src/hooks.ts";
import type { IEventRSVP, IGameEvent } from "../src/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const sample: IGameEvent = {
  id: "ev-1",
  number: 1,
  title: "Test",
  description: "d",
  startTime: 1,
  createdBy: "p",
  createdByName: "P",
  status: "upcoming",
  tags: [],
  maxAttendees: 0,
  createdAt: 1,
  updatedAt: 1,
};

const rsvp: IEventRSVP = {
  id: "r1",
  eventId: "ev-1",
  playerId: "p2",
  playerName: "Q",
  status: "attending",
  createdAt: 1,
};

Deno.test("eventHooks on/emit/off for event:created", OPTS, async () => {
  const seen: IGameEvent[] = [];
  const handler = (ev: IGameEvent) => {
    seen.push(ev);
  };
  eventHooks.on("event:created", handler);
  await eventHooks.emit("event:created", sample);
  assertEquals(seen.length, 1);
  assertEquals(seen[0].title, "Test");

  eventHooks.off("event:created", handler);
  await eventHooks.emit("event:created", sample);
  assertEquals(seen.length, 1);
});

Deno.test("eventHooks rsvp payload", OPTS, async () => {
  let got: IEventRSVP | null = null;
  const handler = (_ev: IGameEvent, r: IEventRSVP) => {
    got = r;
  };
  eventHooks.on("event:rsvp", handler);
  await eventHooks.emit("event:rsvp", sample, rsvp);
  assertEquals(got?.playerName, "Q");
  eventHooks.off("event:rsvp", handler);
});

Deno.test("eventHooks isolates handler errors", OPTS, async () => {
  let second = false;
  const bad = () => {
    throw new Error("boom");
  };
  const good = () => {
    second = true;
  };
  eventHooks.on("event:deleted", bad);
  eventHooks.on("event:deleted", good);
  await eventHooks.emit("event:deleted", sample);
  assertEquals(second, true);
  eventHooks.off("event:deleted", bad);
  eventHooks.off("event:deleted", good);
});
