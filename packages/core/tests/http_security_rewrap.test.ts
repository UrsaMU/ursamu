/**
 * WebSocket upgrade / SSE responses must not get security headers
 * rewrapped (breaks Deno.upgradeWebSocket response).
 */
import { assertEquals } from "@std/assert";
import { shouldSkipSecurityRewrap } from "../src/server/http.ts";

Deno.test("shouldSkipSecurityRewrap — 101 Switching Protocols", () => {
  const res = new Response(null, {
    status: 101,
    headers: { upgrade: "websocket" },
  });
  assertEquals(shouldSkipSecurityRewrap(res), true);
});

Deno.test("shouldSkipSecurityRewrap — SSE content-type", () => {
  const res = new Response("ok", {
    headers: { "content-type": "text/event-stream" },
  });
  assertEquals(shouldSkipSecurityRewrap(res), true);
});

Deno.test("shouldSkipSecurityRewrap — upgrade websocket header", () => {
  const res = new Response(null, {
    status: 200,
    headers: { upgrade: "websocket" },
  });
  assertEquals(shouldSkipSecurityRewrap(res), true);
});

Deno.test("shouldSkipSecurityRewrap — normal JSON is rewrapped", () => {
  const res = new Response("{}", {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  assertEquals(shouldSkipSecurityRewrap(res), false);
});
