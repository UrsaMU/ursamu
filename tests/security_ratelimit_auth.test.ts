/**
 * tests/security_ratelimit_auth.test.ts
 *
 * [MEDIUM] Missing rate limiting on /register and /reset-password.
 *
 * The login endpoint is properly throttled (MAX_LOGIN_ATTEMPTS = 10 per minute
 * per IP). The register and reset-password branches do NOT call
 * isLoginRateLimited(), so an attacker can:
 *   - Flood /register to bcrypt-bomb the server (10 rounds per request)
 *   - Bulk-create accounts to pollute the game world
 *   - Flood /reset-password to exhaustively probe token validity
 *
 * RED:  11+ requests from the same IP to /register or /reset-password never
 *       receive 429 — test fails because we assert at least one 429.
 * GREEN: isLoginRateLimited guard added to both branches — test passes.
 */
import { assertEquals } from "@std/assert";
import { authHandler } from "../src/routes/authRouter.ts";
import { DBO } from "../src/services/Database/database.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// Unique IPs for each test to avoid interference with other test files
const REGISTER_TEST_IP  = "33.44.55.66";
const RESET_TEST_IP     = "33.44.55.77";

// ── /register rate limit ─────────────────────────────────────────────────────

Deno.test(
  "[RateLimit] /register: 11+ attempts from same IP eventually returns 429",
  OPTS,
  async () => {
    const statuses: number[] = [];
    // Use a unique email per request so we don't hit the "user exists" 409
    // before we can exercise the rate limit.
    for (let i = 0; i < 12; i++) {
      const req = new Request("http://localhost/api/v1/auth/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          username: `ratelimittest${i}x`,
          password: "password123!",
          email:    `ratelimit_reg_${i}@example.com`,
        }),
      });
      const res = await authHandler(req, REGISTER_TEST_IP);
      statuses.push(res.status);
    }
    const has429 = statuses.some((s) => s === 429);
    assertEquals(has429, true, `Expected at least one 429 but got: [${statuses.join(", ")}]`);
  },
);

// ── /reset-password rate limit ────────────────────────────────────────────────

Deno.test(
  "[RateLimit] /reset-password: 11+ attempts from same IP eventually returns 429",
  OPTS,
  async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const req = new Request("http://localhost/api/v1/auth/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          token:       `bogustoken${i}`,
          newPassword: "NewSecurePassword1!",
        }),
      });
      const res = await authHandler(req, RESET_TEST_IP);
      statuses.push(res.status);
    }
    const has429 = statuses.some((s) => s === 429);
    assertEquals(has429, true, `Expected at least one 429 but got: [${statuses.join(", ")}]`);
  },
);

// ── cleanup ───────────────────────────────────────────────────────────────────

Deno.test("security_ratelimit_auth cleanup", OPTS, async () => {
  await DBO.close();
});
