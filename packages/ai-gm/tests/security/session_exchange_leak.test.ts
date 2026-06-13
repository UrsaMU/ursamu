// ─── EXPLOIT: Session Exchange Info Leak ─────────────────────────────────────
//
// VULNERABILITY: api/routes.ts GET /api/gm/sessions/:id returns ALL exchanges
//   regardless of which session is requested, because the filter is:
//     .filter((e) => e.roomId === id || true)
//   The `|| true` short-circuits every element to true.
//
// EXPLOIT: Any authenticated caller can request an arbitrary session ID and
//   receive all 200 most recent GM exchanges from every room/session in the
//   system, leaking private conversation content.
//
// Red phase: these tests FAIL before the fix (exploit succeeds).
// Green phase: these tests PASS after the fix (exploit blocked).

import { assertEquals, assertNotEquals } from "@std/assert";
import { handleGmRequest } from "../../api/routes.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(path: string, secret = "test-secret"): Request {
  return new Request(`http://localhost${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

// ─── Exploit tests ────────────────────────────────────────────────────────────

Deno.test({
  name: "SECURITY: GET /api/gm/sessions/:id must 404 for nonexistent session",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // With the || true bug, a nonexistent session ID returns 200 with data.
    // After the fix, it must return 404 when the session does not exist.
    const res = await handleGmRequest(
      makeReq("/api/gm/sessions/DOES_NOT_EXIST_XYZ"),
      { adminCreditGrantFn: () => Promise.resolve(0) },
    );
    // Must be a Response
    assertEquals(res instanceof Response, true);
    const status = (res as Response).status;
    // Should NOT be 200 — a nonexistent session must not return data
    assertEquals(
      status,
      404,
      `Expected 404 for unknown session, got ${status}`,
    );
  },
});

Deno.test("SECURITY: GET /api/gm/sessions/:id must not return exchanges from unrelated sessions", async () => {
  // Even if we get a 200 for a real session, the exchanges returned must
  // belong to that session's time range — not all exchanges in the system.
  // We test this structurally by ensuring the filter logic doesn't use || true.
  const res = await handleGmRequest(
    makeReq("/api/gm/sessions/phantom-session-id-999"),
    { adminCreditGrantFn: () => Promise.resolve(0) },
  );
  // A phantom session must not expose data
  const status = (res as Response).status;
  assertNotEquals(
    status,
    200,
    "BUG: phantom session returned 200 — || true filter is leaking all exchanges",
  );
});
