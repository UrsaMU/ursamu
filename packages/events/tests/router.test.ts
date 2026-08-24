import { assertEquals } from "@std/assert";
import { eventsRouteHandler } from "../src/router.ts";
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
    return await fn();
  } finally {
    restore();
  }
}

async function json(
  res: Response,
): Promise<{ status: number; body: Record<string, unknown> | unknown[] }> {
  const body = await res.json();
  return { status: res.status, body };
}

function req(
  method: string,
  path: string,
  body?: unknown,
): Request {
  return new Request(`http://test${path}`, {
    method,
    headers: body
      ? { "Content-Type": "application/json" }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

Deno.test("REST unauthorized without userId", OPTS, async () => {
  await withDb(async () => {
    const res = await eventsRouteHandler(req("GET", "/api/v1/events"), null);
    const { status, body } = await json(res);
    assertEquals(status, 401);
    assertEquals((body as { error: string }).error, "Unauthorized");
  });
});

Deno.test("REST create forbidden for non-staff", OPTS, async () => {
  await withDb(async () => {
    const res = await eventsRouteHandler(
      req("POST", "/api/v1/events", {
        title: "X",
        description: "Y",
        startTime: "2030-01-01",
      }),
      "p-1",
    );
    assertEquals(res.status, 403);
  });
});

Deno.test("REST create list get rsvp cancel delete", OPTS, async () => {
  await withDb(async () => {
    const create = await eventsRouteHandler(
      req("POST", "/api/v1/events", {
        title: "Gala",
        description: "Big party",
        startTime: "2030-08-01 19:00",
        maxAttendees: 10,
        tags: ["social"],
      }),
      "staff-1",
    );
    const created = await json(create);
    assertEquals(created.status, 201);
    const ev = created.body as {
      number: number;
      id: string;
      title: string;
    };
    assertEquals(ev.title, "Gala");
    assertEquals(ev.number, 1);

    const list = await json(
      await eventsRouteHandler(req("GET", "/api/v1/events"), "p-1"),
    );
    assertEquals(list.status, 200);
    assertEquals((list.body as { total: number }).total, 1);

    const one = await json(
      await eventsRouteHandler(
        req("GET", `/api/v1/events/${ev.number}`),
        "p-1",
      ),
    );
    assertEquals(one.status, 200);
    assertEquals((one.body as { title: string }).title, "Gala");

    const rsvp = await json(
      await eventsRouteHandler(
        req("POST", `/api/v1/events/${ev.number}/rsvp`, {
          status: "maybe",
        }),
        "p-1",
      ),
    );
    assertEquals(rsvp.status, 201);
    assertEquals((rsvp.body as { status: string }).status, "maybe");

    const rsvp2 = await json(
      await eventsRouteHandler(
        req("POST", `/api/v1/events/${ev.number}/rsvp`, {
          status: "attending",
        }),
        "p-1",
      ),
    );
    assertEquals(rsvp2.status, 200);
    assertEquals((rsvp2.body as { status: string }).status, "attending");

    const un = await json(
      await eventsRouteHandler(
        req("DELETE", `/api/v1/events/${ev.number}/rsvp`),
        "p-1",
      ),
    );
    assertEquals(un.status, 200);

    const patch = await json(
      await eventsRouteHandler(
        req("PATCH", `/api/v1/events/${ev.number}`, {
          status: "cancelled",
        }),
        "staff-1",
      ),
    );
    assertEquals(patch.status, 200);
    assertEquals((patch.body as { status: string }).status, "cancelled");

    const hidden = await json(
      await eventsRouteHandler(
        req("GET", `/api/v1/events/${ev.number}`),
        "p-1",
      ),
    );
    assertEquals(hidden.status, 404);

    const del = await json(
      await eventsRouteHandler(
        req("DELETE", `/api/v1/events/${ev.id}`),
        "staff-1",
      ),
    );
    assertEquals(del.status, 200);
  });
});

Deno.test("REST upcoming endpoint", OPTS, async () => {
  await withDb(async () => {
    await eventsRouteHandler(
      req("POST", "/api/v1/events", {
        title: "Soon",
        description: "d",
        startTime: Date.now() + 86_400_000,
      }),
      "staff-1",
    );
    const res = await json(
      await eventsRouteHandler(
        req("GET", "/api/v1/events/upcoming"),
        "p-1",
      ),
    );
    assertEquals(res.status, 200);
    assertEquals(Array.isArray(res.body), true);
    assertEquals((res.body as unknown[]).length >= 1, true);
  });
});
