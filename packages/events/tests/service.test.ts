import { assertEquals, assertExists } from "@std/assert";
import { eventHooks } from "../src/hooks.ts";
import type { IGameEvent } from "../src/types.ts";
import {
  cancelEvent,
  cancelRsvp,
  createEvent,
  createEventFromStrings,
  deleteEvent,
  editEventField,
  getEventByNumber,
  listEvents,
  listUpcomingEvents,
  setEventStatus,
  upsertRsvp,
  withRsvpSummary,
} from "../src/service.ts";
import {
  installMemoryDb,
  OPTS,
  resetCollections,
  seedPlayer,
} from "./harness.ts";

async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  const restore = installMemoryDb();
  try {
    await resetCollections();
    seedPlayer("staff-1", { name: "Ada", staff: true });
    seedPlayer("p-1", { name: "Bob" });
    seedPlayer("p-2", { name: "Cara" });
    return await fn();
  } finally {
    restore();
  }
}

Deno.test("service create + list + getByNumber", OPTS, async () => {
  await withDb(async () => {
    const created = await createEvent({
      title: "Gala",
      description: "Party",
      startTime: Date.parse("2030-06-01T19:00:00Z"),
      createdBy: "staff-1",
      createdByName: "Ada",
    });
    assertEquals(created.ok, true);
    if (!created.ok) return;
    assertEquals(created.value.number, 1);
    assertEquals(created.value.id, "ev-1");

    const byNum = await getEventByNumber(1);
    assertExists(byNum);
    assertEquals(byNum!.title, "Gala");

    const list = await listEvents({ staff: false });
    assertEquals(list.length, 1);
  });
});

Deno.test("service createEventFromStrings parses dates", OPTS, async () => {
  await withDb(async () => {
    const r = await createEventFromStrings({
      title: "Meet",
      description: "Talk",
      startTimeRaw: "2030-07-04 18:00",
      createdBy: "staff-1",
    });
    assertEquals(r.ok, true);
  });
});

Deno.test("service rsvp capacity and cancel", OPTS, async () => {
  await withDb(async () => {
    const created = await createEvent({
      title: "Tiny",
      description: "Cap 1",
      startTime: Date.now() + 86_400_000,
      createdBy: "staff-1",
      maxAttendees: 1,
    });
    assertEquals(created.ok, true);
    if (!created.ok) return;
    const ev = created.value;

    const a = await upsertRsvp({
      event: ev,
      playerId: "p-1",
      playerName: "Bob",
      statusRaw: "yes",
    });
    assertEquals(a.ok, true);
    if (!a.ok) return;
    assertEquals(a.value.created, true);
    assertEquals(a.value.rsvp.status, "attending");

    const b = await upsertRsvp({
      event: ev,
      playerId: "p-2",
      playerName: "Cara",
      statusRaw: "attending",
    });
    assertEquals(b.ok, false);
    if (b.ok) return;
    assertEquals(b.status, 409);

    const summary = await withRsvpSummary(ev, "p-1");
    assertEquals(summary.attendingCount, 1);
    assertEquals(summary.myRsvp, "attending");

    const un = await cancelRsvp({ event: ev, playerId: "p-1" });
    assertEquals(un.ok, true);

    const c = await upsertRsvp({
      event: ev,
      playerId: "p-2",
      statusRaw: "attending",
    });
    assertEquals(c.ok, true);
  });
});

Deno.test("service status hooks cancel/complete/delete", OPTS, async () => {
  await withDb(async () => {
    const seen: string[] = [];
    const h = (ev: IGameEvent) => {
      seen.push(`${ev.status}:${ev.number}`);
    };
    eventHooks.on("event:cancelled", h);
    eventHooks.on("event:completed", h);
    eventHooks.on("event:deleted", h);

    try {
      const created = await createEvent({
        title: "X",
        description: "Y",
        startTime: Date.now() + 1000,
        createdBy: "staff-1",
      });
      assertEquals(created.ok, true);
      if (!created.ok) return;

      await cancelEvent(created.value);
      const again = await getEventByNumber(created.value.number);
      assertEquals(again?.status, "cancelled");

      const created2 = await createEvent({
        title: "Z",
        description: "W",
        startTime: Date.now() + 1000,
        createdBy: "staff-1",
      });
      if (!created2.ok) return;
      await setEventStatus(created2.value, "completed");
      await deleteEvent((await getEventByNumber(created2.value.number))!);

      assertEquals(seen.some((s) => s.startsWith("cancelled:")), true);
      assertEquals(seen.some((s) => s.startsWith("completed:")), true);
    } finally {
      eventHooks.off("event:cancelled", h);
      eventHooks.off("event:completed", h);
      eventHooks.off("event:deleted", h);
    }
  });
});

Deno.test("service edit field + list hides cancelled from players", OPTS, async () => {
  await withDb(async () => {
    const created = await createEvent({
      title: "Old",
      description: "D",
      startTime: Date.now() + 5000,
      createdBy: "staff-1",
    });
    if (!created.ok) return;
    const edited = await editEventField(created.value, "title", "New");
    assertEquals(edited.ok, true);
    if (!edited.ok) return;
    assertEquals(edited.value.title, "New");

    await cancelEvent(edited.value);
    const players = await listEvents({ staff: false });
    assertEquals(players.length, 0);
    const staff = await listEvents({ staff: true });
    assertEquals(staff.length, 1);
  });
});

Deno.test("service listUpcoming filters past", OPTS, async () => {
  await withDb(async () => {
    await createEvent({
      title: "Past",
      description: "d",
      startTime: Date.now() - 10_000,
      createdBy: "staff-1",
    });
    await createEvent({
      title: "Future",
      description: "d",
      startTime: Date.now() + 86_400_000,
      createdBy: "staff-1",
    });
    const up = await listUpcomingEvents();
    assertEquals(up.every((e) => e.title === "Future"), true);
  });
});
