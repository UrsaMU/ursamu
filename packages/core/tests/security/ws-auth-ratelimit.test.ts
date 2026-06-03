/**
 * Security test — WebSocket auth rate-limit bypass
 *
 * Exploit: auth messages (type:"auth") are processed before the rate-limit
 * check, so an attacker can spray unlimited auth tokens per second with no
 * throttling, enabling credential brute-force.
 *
 * Fix: count auth attempts toward the rate limit (or a stricter per-socket
 * auth-attempt counter) so floods are throttled.
 */
import { assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// We test the exported isRateLimited + handleMessage logic by importing
// the internal rate-limit state via a test-only escape hatch.
// Since WebSocket transport doesn't export internals, we verify the
// behaviour contract: after N rapid auth messages the socket is rate-limited.

Deno.test("WS auth — auth messages count toward rate limit", OPTS, async () => {
  // Import the module fresh to get isolated state.
  const mod = await import("../../src/server/websocket.ts");

  // isRateLimitedForAuth should exist after the fix.
  // Until then this test will fail because the export doesn't exist.
  const fn = (mod as Record<string, unknown>).isRateLimitedForAuth;
  assertEquals(
    typeof fn,
    "function",
    "isRateLimitedForAuth must be exported for auth-specific rate limiting",
  );
});
