/**
 * tests/security_ws_ratelimit_key.test.ts
 *
 * [SEC][L2] WebSocket rate limit keyed on socket ID — multi-socket bypass
 *
 * When the rate limiter uses `sockData.id` (per-connection UUID), a single
 * authenticated user can open N WebSocket connections and send N×RATE_LIMIT
 * commands per window with no throttling.
 *
 * RED:  Show that two sockets with the same cid but different ids each get
 *       their own counter — the second socket is never limited even after the
 *       first hits the cap.
 *
 * GREEN: Key the rate limit on `sockData.cid ?? sockData.id` so all
 *        connections from the same authenticated user share one counter.
 */
import { assertEquals } from "@std/assert";

// Inline the vulnerable key function (keyed on socket ID)
function vulnerableKey(sockData: { id: string; cid?: string }): string {
  return sockData.id;
}

// Inline the fixed key function (keyed on user ID when available)
function fixedKey(sockData: { id: string; cid?: string }): string {
  return sockData.cid ?? sockData.id;
}

function makeRateLimiter(keyFn: (s: { id: string; cid?: string }) => string, limit = 3, windowMs = 60_000) {
  const map = new Map<string, { count: number; resetAt: number }>();

  function isLimited(sockData: { id: string; cid?: string }, now = Date.now()): boolean {
    const key = keyFn(sockData);
    const entry = map.get(key);
    if (!entry || now >= entry.resetAt) {
      map.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
    entry.count++;
    return entry.count > limit;
  }

  return { isLimited };
}

const SOCKET_A = { id: "socket-aaa", cid: "user-42" };
const SOCKET_B = { id: "socket-bbb", cid: "user-42" }; // same user, second connection
const SOCKET_C = { id: "socket-ccc" };                  // anonymous (no cid)

// ── Exploit proof ─────────────────────────────────────────────────────────────

Deno.test("[SEC][L2] vulnerable: two sockets for same user get independent counters", () => {
  const { isLimited } = makeRateLimiter(vulnerableKey, 3);
  const now = Date.now();

  // Exhaust socket A
  isLimited(SOCKET_A, now);
  isLimited(SOCKET_A, now);
  isLimited(SOCKET_A, now);
  isLimited(SOCKET_A, now);
  const limitedA = isLimited(SOCKET_A, now);
  assertEquals(limitedA, true, "socket A should be rate-limited");

  // Socket B (same user!) is NOT limited — exploit confirmed
  const limitedB = isLimited(SOCKET_B, now);
  assertEquals(limitedB, false, "FLAW: socket B is not limited — multi-socket bypass confirmed");
});

// ── Fix validation ────────────────────────────────────────────────────────────

Deno.test("[SEC][L2] fixed: second socket for same user shares the rate limit counter", () => {
  const { isLimited } = makeRateLimiter(fixedKey, 3);
  const now = Date.now();

  // Exhaust via socket A
  isLimited(SOCKET_A, now);
  isLimited(SOCKET_A, now);
  isLimited(SOCKET_A, now);
  isLimited(SOCKET_A, now);
  const limitedA = isLimited(SOCKET_A, now);
  assertEquals(limitedA, true, "socket A is rate-limited");

  // Socket B (same user) must also be limited — shared counter
  const limitedB = isLimited(SOCKET_B, now);
  assertEquals(limitedB, true, "socket B must also be rate-limited — fix verified");
});

Deno.test("[SEC][L2] fixed: anonymous sockets (no cid) fall back to socket ID key", () => {
  const { isLimited } = makeRateLimiter(fixedKey, 3);
  const now = Date.now();

  // Anonymous socket hits its own limit
  isLimited(SOCKET_C, now);
  isLimited(SOCKET_C, now);
  isLimited(SOCKET_C, now);
  isLimited(SOCKET_C, now);
  const limited = isLimited(SOCKET_C, now);
  assertEquals(limited, true, "anonymous socket is still rate-limited by socket ID");
});

Deno.test("[SEC][L2] fixed: different authenticated users get independent counters", () => {
  const { isLimited } = makeRateLimiter(fixedKey, 3);
  const now = Date.now();
  const userX = { id: "sock-x1", cid: "user-X" };
  const userY = { id: "sock-y1", cid: "user-Y" };

  // Exhaust user X
  isLimited(userX, now);
  isLimited(userX, now);
  isLimited(userX, now);
  isLimited(userX, now);
  isLimited(userX, now);

  // User Y is unaffected
  const limitedY = isLimited(userY, now);
  assertEquals(limitedY, false, "a different user is not affected by another user's rate limit");
});
