/**
 * Live REST E2E against games/events-local.
 */
import { assertEquals, assertExists } from "jsr:@std/assert@1";
import {
  apiJson,
  ensureGame,
  ensureGod,
  OPTS,
  registerPlayer,
} from "./harness.ts";

Deno.test({
  name: "e2e setup: ensure game",
  ...OPTS,
  sanitizeExit: false,
  fn: async () => {
    await ensureGame();
    await ensureGod();
  },
});

Deno.test("e2e REST: create list rsvp capacity cancel delete", OPTS, async () => {
  await ensureGame();
  const staff = await ensureGod();
  const player = await registerPlayer("evplay");

  const start = "2035-06-15 19:00";
  const created = await apiJson<{
    number: number;
    id: string;
    title: string;
    error?: string;
  }>(staff.token, "POST", "/api/v1/events", {
    title: "E2E Gala",
    description: "Playwright REST party",
    startTime: start,
    maxAttendees: 1,
    tags: ["e2e"],
  });
  assertEquals(created.status, 201, JSON.stringify(created.data));
  assertEquals(created.data.title, "E2E Gala");
  assertExists(created.data.number);

  const list = await apiJson<{
    total: number;
    events: { title: string }[];
  }>(staff.token, "GET", "/api/v1/events?limit=50");
  assertEquals(list.status, 200);
  assertEquals(
    list.data.events.some((e) => e.title === "E2E Gala"),
    true,
  );

  const one = await apiJson<{
    title: string;
    attendingCount: number;
  }>(
    staff.token,
    "GET",
    `/api/v1/events/${created.data.number}`,
  );
  assertEquals(one.status, 200);
  assertEquals(one.data.title, "E2E Gala");

  const rsvp1 = await apiJson<{ status: string }>(
    player.token,
    "POST",
    `/api/v1/events/${created.data.number}/rsvp`,
    { status: "attending" },
  );
  assertEquals(rsvp1.status, 201, JSON.stringify(rsvp1.data));
  assertEquals(rsvp1.data.status, "attending");

  const other = await registerPlayer("evfull");
  const rsvpFull = await apiJson<{ error?: string }>(
    other.token,
    "POST",
    `/api/v1/events/${created.data.number}/rsvp`,
    { status: "attending" },
  );
  assertEquals(rsvpFull.status, 409);

  const maybe = await apiJson<{ status: string }>(
    other.token,
    "POST",
    `/api/v1/events/${created.data.number}/rsvp`,
    { status: "maybe" },
  );
  assertEquals(maybe.status, 201);
  assertEquals(maybe.data.status, "maybe");

  const un = await apiJson(
    player.token,
    "DELETE",
    `/api/v1/events/${created.data.number}/rsvp`,
  );
  assertEquals(un.status, 200);

  const cancel = await apiJson<{ status: string }>(
    staff.token,
    "PATCH",
    `/api/v1/events/${created.data.number}`,
    { status: "cancelled" },
  );
  assertEquals(cancel.status, 200);
  assertEquals(cancel.data.status, "cancelled");

  const hidden = await apiJson(
    player.token,
    "GET",
    `/api/v1/events/${created.data.number}`,
  );
  assertEquals(hidden.status, 404);

  const del = await apiJson(
    staff.token,
    "DELETE",
    `/api/v1/events/${created.data.id}`,
  );
  assertEquals(del.status, 200);
});

Deno.test("e2e REST: upcoming endpoint", OPTS, async () => {
  await ensureGame();
  const staff = await ensureGod();
  await apiJson(staff.token, "POST", "/api/v1/events", {
    title: "Soon Event",
    description: "future",
    startTime: Date.now() + 7 * 86_400_000,
  });
  const up = await apiJson<unknown[]>(
    staff.token,
    "GET",
    "/api/v1/events/upcoming",
  );
  assertEquals(up.status, 200);
  assertEquals(Array.isArray(up.data), true);
  assertEquals(
    (up.data as { title: string }[]).some((e) => e.title === "Soon Event"),
    true,
  );
});

