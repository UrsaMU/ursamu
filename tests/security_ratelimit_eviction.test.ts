/**
 * tests/security_ratelimit_eviction.test.ts
 *
 * [SEC][M2] Rate-limit FIFO eviction allows attacker to reset their own counter
 *
 * The login rate-limiter uses a Map with FIFO eviction when MAX_TRACKED_IPS is
 * reached. Because Map insertion order is deterministic and eviction always
 * removes the oldest entry, an attacker can:
 *
 *   1. Exhaust MAX_TRACKED_IPS slots with throwaway IPs.
 *   2. Their original IP is now the oldest entry.
 *   3. Any new attempt from a new IP evicts the attacker's entry.
 *   4. The attacker's next request starts a fresh counter.
 *
 * After 10 failed logins, a single new-IP probe resets the attacker's limit.
 *
 * RED:  Flood the map, then show that the attacker's IP is evicted and gets
 *       a fresh counter instead of staying rate-limited.
 *
 * GREEN: Replace FIFO eviction with time-based expiration — the attacker's
 *        entry is only removed when its resetAt clock expires, not when the
 *        map is full.
 */
import { assertEquals } from "@std/assert";

// Must match the constant in authRouter.ts
const MAX_TRACKED_IPS = 10_000;

// Inline FIFO implementation (mirrors the current code) to prove the flaw.
function makeFIFOLimiter(maxIps = MAX_TRACKED_IPS, windowMs = 60_000, maxAttempts = 10) {
  const map = new Map<string, { count: number; resetAt: number }>();

  function isLimited(ip: string, now = Date.now()): boolean {
    const entry = map.get(ip);
    if (!entry || now >= entry.resetAt) {
      if (!entry && map.size >= maxIps) {
        map.delete(map.keys().next().value!); // FIFO eviction ← the flaw
      }
      map.set(ip, { count: 1, resetAt: now + windowMs });
      return false;
    }
    entry.count++;
    return entry.count > maxAttempts;
  }

  return { isLimited, map };
}

// Inline time-based eviction (the fix) — evict expired entries, not oldest.
function makeTimeLimiter(maxIps = MAX_TRACKED_IPS, windowMs = 60_000, maxAttempts = 10) {
  const map = new Map<string, { count: number; resetAt: number }>();

  function evictExpired(now: number): void {
    for (const [ip, entry] of map) {
      if (now >= entry.resetAt) map.delete(ip);
    }
  }

  function isLimited(ip: string, now = Date.now()): boolean {
    const entry = map.get(ip);
    if (!entry || now >= entry.resetAt) {
      // If still full after expiry sweep, reject new IPs gracefully.
      if (!entry) {
        evictExpired(now);
        if (map.size >= maxIps) {
          // Map is full and no expired entries — conservatively rate-limit.
          return true;
        }
      }
      map.set(ip, { count: 1, resetAt: now + windowMs });
      return false;
    }
    entry.count++;
    return entry.count > maxAttempts;
  }

  return { isLimited, map };
}

// ── Exploit proof: FIFO eviction lets attacker reset their counter ─────────

Deno.test("[SEC][M2] FIFO eviction: attacker IP evicted when map is full, resets counter", () => {
  const { isLimited, map: _map } = makeFIFOLimiter(5, 60_000, 3); // tiny map for speed
  const attackerIp = "1.2.3.4";
  const now = Date.now();

  // Attacker hits limit (4 attempts — first call adds entry, then 3 more hits limit)
  isLimited(attackerIp, now);
  isLimited(attackerIp, now);
  isLimited(attackerIp, now);
  isLimited(attackerIp, now);
  const limited = isLimited(attackerIp, now);
  assertEquals(limited, true, "attacker should be rate-limited after exceeding maxAttempts");

  // Flood the map with throwaway IPs to fill it to capacity
  // (attacker's IP was the first entry → it becomes the oldest)
  for (let i = 0; i < 5; i++) {
    isLimited(`throwaway-${i}.example.com`, now + 1); // slightly later to stay ordered
  }

  // Now attacker's entry has been FIFO-evicted. They get a fresh counter.
  const afterEviction = isLimited(attackerIp, now + 2);
  // With FIFO, this should be false (entry reset) — PROVING THE FLAW
  assertEquals(afterEviction, false, "FIFO eviction reset the attacker's counter — vulnerability confirmed");
});

// ── Fix validation: time-based eviction keeps attacker blocked ────────────

Deno.test("[SEC][M2] time-based eviction: attacker IP stays blocked even when map is full", () => {
  const { isLimited } = makeTimeLimiter(5, 60_000, 3);
  const attackerIp = "1.2.3.4";
  const now = Date.now();

  // Attacker hits limit
  isLimited(attackerIp, now);
  isLimited(attackerIp, now);
  isLimited(attackerIp, now);
  isLimited(attackerIp, now);
  isLimited(attackerIp, now); // over limit

  // Fill remaining slots with non-expired throwaway IPs
  for (let i = 0; i < 4; i++) {
    isLimited(`throwaway-${i}.example.com`, now + 1);
  }

  // Map is now full. Attacker tries again — should still be blocked.
  const stillLimited = isLimited(attackerIp, now + 2);
  assertEquals(stillLimited, true, "attacker must remain blocked — time-based eviction does not reset counter");
});

Deno.test("[SEC][M2] time-based eviction: expired entries are swept before new IPs are admitted", () => {
  const { isLimited, map } = makeTimeLimiter(3, 1, 10); // 1ms window — expires immediately
  const now = Date.now();

  // Fill map with entries that will expire at now+1ms
  isLimited("old-1.example.com", now);
  isLimited("old-2.example.com", now);
  isLimited("old-3.example.com", now);
  assertEquals(map.size, 3);

  // New request at now+10ms — all old entries are expired
  const result = isLimited("new-ip.example.com", now + 10);
  assertEquals(result, false, "new IP admitted after expired entries swept");
  // old entries should be gone
  assertEquals(map.has("old-1.example.com"), false);
  assertEquals(map.has("old-2.example.com"), false);
  assertEquals(map.has("old-3.example.com"), false);
});

Deno.test("[SEC][M2] time-based eviction: when map is full of unexpired IPs, new IPs are blocked", () => {
  const { isLimited } = makeTimeLimiter(3, 60_000, 10);
  const now = Date.now();

  // Fill map completely with non-expiring entries
  isLimited("blocked-1.example.com", now);
  isLimited("blocked-2.example.com", now);
  isLimited("blocked-3.example.com", now);

  // New IP — map is full, no expired entries to sweep → new IP blocked
  const blocked = isLimited("new-attacker.example.com", now + 1);
  assertEquals(blocked, true, "new IPs are rate-limited when map is full and no entries have expired");
});
