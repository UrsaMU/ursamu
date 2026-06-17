/**
 * Security test — missing rate limit on HTTP /input and Telnet
 *
 * Exploit: HTTP POST /input and Telnet connections have no rate limiting —
 * an attacker can flood the pipeline with arbitrary speed.
 *
 * Fix: both transports must enforce the same per-socketId rate limit
 * (10 cmd/sec) already used by the WebSocket transport.
 */
import { assert } from "@std/assert";
import { requestHandler } from "../../src/server/http.ts";
import { registerSender } from "../../src/broadcast/send.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// Seed a sender so send() doesn't throw
registerSender(() => {});

Deno.test("HTTP rate limit — POST /input must be rate-limited per socket", OPTS, async () => {
  // Open an SSE stream to get a server-assigned socketId
  const evtReq = new Request("http://localhost/events", {
    method: "GET",
    headers: { accept: "text/event-stream" },
  });
  const evtRes = await requestHandler(evtReq);
  const socketId = evtRes.headers.get("x-socket-id")!;
  evtRes.body?.cancel();

  assert(socketId, "should have a socketId from SSE");

  // Send 15 rapid POST /input requests — first 10 should be accepted,
  // remainder should be rate-limited (429) after the fix.
  const results: number[] = [];
  for (let i = 0; i < 15; i++) {
    const r = await requestHandler(new Request("http://localhost/input", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-socket-id": socketId,
      },
      body: JSON.stringify({ input: `cmd ${i}` }),
    }));
    results.push(r.status);
  }

  const rateLimited = results.filter((s) => s === 429);
  assert(
    rateLimited.length > 0,
    `HTTP /input must rate-limit after 10 rapid requests — got statuses: ${results.join(",")}`,
  );
});
