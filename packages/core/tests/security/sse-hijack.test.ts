/**
 * Security test — SSE session hijack
 *
 * Exploit: attacker supplies ?socketId=<victim> — server opens an SSE
 * stream under that exact ID and delivers all victim messages to attacker.
 *
 * Fix invariants verified here:
 *   1. Response carries X-Socket-Id header with the server-assigned ID.
 *   2. Server-assigned ID is never the attacker-supplied ID.
 *   3. Attacker connecting with victim's ID gets a DIFFERENT ID.
 */
import { assertEquals, assertNotEquals, assert } from "@std/assert";
import { requestHandler } from "../../src/server/http.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("SSE hijack — response must expose server-generated X-Socket-Id", OPTS, async () => {
  const req = new Request("http://localhost/events", {
    method: "GET",
    headers: { accept: "text/event-stream" },
  });

  const res = await requestHandler(req);
  assertEquals(res.status, 200);
  res.body?.cancel();

  // Fix must add X-Socket-Id header so client knows its assigned ID
  const assigned = res.headers.get("x-socket-id");
  assert(assigned !== null, "Response must include X-Socket-Id header");
  assert(assigned.length > 0, "X-Socket-Id must not be empty");
});

Deno.test("SSE hijack — server must ignore client-supplied socketId", OPTS, async () => {
  const attackerSupplied = "victim-socket-id-12345";

  const req = new Request(
    `http://localhost/events?socketId=${attackerSupplied}`,
    { method: "GET", headers: { accept: "text/event-stream" } },
  );

  const res = await requestHandler(req);
  assertEquals(res.status, 200);
  res.body?.cancel();

  const assigned = res.headers.get("x-socket-id");
  assert(assigned !== null, "Must return X-Socket-Id header");

  // Server-assigned ID must never equal the attacker-supplied one
  assertNotEquals(
    assigned,
    attackerSupplied,
    "Server used attacker-supplied socketId — session hijack is possible",
  );
});

Deno.test("SSE hijack — two requests get different socket IDs", OPTS, async () => {
  const r1 = new Request("http://localhost/events", {
    method: "GET",
    headers: { accept: "text/event-stream" },
  });
  const r2 = new Request("http://localhost/events", {
    method: "GET",
    headers: { accept: "text/event-stream" },
  });

  const [res1, res2] = await Promise.all([requestHandler(r1), requestHandler(r2)]);
  res1.body?.cancel();
  res2.body?.cancel();

  const id1 = res1.headers.get("x-socket-id");
  const id2 = res2.headers.get("x-socket-id");
  assertNotEquals(id1, id2, "Each connection must receive a unique socketId");
});
