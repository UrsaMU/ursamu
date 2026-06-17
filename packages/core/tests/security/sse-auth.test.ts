/**
 * Security test — SSE stream opened without authentication
 *
 * When server.requireAuthForSSE is true, the /events endpoint must
 * reject connections that do not present a valid Bearer token.
 * Without this guard, anonymous clients fill the session store and
 * can receive messages if they guess a valid socketId.
 *
 * Fix: check Authorization header when requireAuthForSSE is enabled.
 * Default is false so existing unauthenticated flows (login screen)
 * still work — the guard is opt-in per deployment.
 */
import { assertEquals } from "@std/assert";
import { setConfig } from "../../src/config/mod.ts";
import { requestHandler } from "../../src/server/http.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("SSE auth — must reject when requireAuthForSSE=true and no token", OPTS, async () => {
  setConfig("server.requireAuthForSSE", true);

  const req = new Request("http://localhost/events", {
    method: "GET",
    headers: { accept: "text/event-stream" },
    // No Authorization header
  });

  const res = await requestHandler(req);
  res.body?.cancel();

  assertEquals(
    res.status,
    401,
    "SSE endpoint must return 401 when requireAuthForSSE=true and no token presented",
  );

  // Reset for other tests
  setConfig("server.requireAuthForSSE", false);
});

Deno.test("SSE auth — must allow when requireAuthForSSE=false (default)", OPTS, async () => {
  setConfig("server.requireAuthForSSE", false);

  const req = new Request("http://localhost/events", {
    method: "GET",
    headers: { accept: "text/event-stream" },
  });

  const res = await requestHandler(req);
  res.body?.cancel();

  assertEquals(res.status, 200, "SSE must be open when requireAuthForSSE=false");
});
