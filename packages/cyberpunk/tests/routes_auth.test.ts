/**
 * REST route auth gates.
 */
import { assertEquals } from "@std/assert";
import { routeHandler } from "../routes.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("GET /api/v1/cpr requires auth", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://localhost/api/v1/cpr"),
    null,
  );
  assertEquals(res.status, 401);
});

Deno.test("GET /api/v1/cpr/meta is public", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://localhost/api/v1/cpr/meta"),
    null,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.system, "cpr");
});

Deno.test("GET /api/v1/cpr/chargen/options is public", OPTS, async () => {
  const res = await routeHandler(
    new Request(
      "http://localhost/api/v1/cpr/chargen/options?topic=roles",
    ),
    null,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.topic, "roles");
});

Deno.test("POST chargen/set requires auth", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://localhost/api/v1/cpr/chargen/set", {
      method: "POST",
      body: "{}",
    }),
    null,
  );
  assertEquals(res.status, 401);
});

Deno.test("POST chargen/next requires auth", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://localhost/api/v1/cpr/chargen/next", {
      method: "POST",
    }),
    null,
  );
  assertEquals(res.status, 401);
});

Deno.test("POST chargen/roll requires auth", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://localhost/api/v1/cpr/chargen/roll", {
      method: "POST",
      body: "{}",
    }),
    null,
  );
  assertEquals(res.status, 401);
});

Deno.test("GET chargen/gear requires auth", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://localhost/api/v1/cpr/chargen/gear"),
    null,
  );
  assertEquals(res.status, 401);
});

Deno.test("GET options lifepath returns table rows", OPTS, async () => {
  const res = await routeHandler(
    new Request(
      "http://localhost/api/v1/cpr/chargen/options" +
        "?topic=lifepath&stage=lifepath_cultural",
    ),
    null,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.topic, "lifepath");
  assertEquals(Array.isArray(body.items), true);
  assertEquals(body.items.length >= 10, true);
});

Deno.test("GET /api/v1/cpr/sheet requires auth", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://localhost/api/v1/cpr/sheet"),
    null,
  );
  assertEquals(res.status, 401);
});

Deno.test("POST /api/v1/cpr/approve requires auth", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://localhost/api/v1/cpr/approve", {
      method: "POST",
      body: "{}",
    }),
    null,
  );
  assertEquals(res.status, 401);
});
