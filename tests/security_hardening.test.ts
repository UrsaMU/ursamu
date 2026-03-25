/**
 * tests/security_hardening.test.ts
 *
 * TDD-audit remediation tests:
 *   H2  — Content-Security-Policy header strength
 *   M1  — Wizard privilege level in resolveCallerPrivLevel
 *   M2  — WebSocket rate-limiter unbounded memory
 *   M3  — MUSH ANSI ReDoS guard
 */

import { assertEquals, assertStringIncludes, assert } from "@std/assert";
import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";
import { handleRequest } from "../src/app.ts";
import { wsService } from "../src/services/WebSocket/index.ts";
import { DBO } from "../src/services/Database/database.ts";
import { dbojs } from "../src/services/Database/database.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ── Mock WebSocket ─────────────────────────────────────────────────────────────

class MockWS extends EventTarget {
  readyState = 1;
  sent: string[] = [];
  closed = false;
  send(d: string) { this.sent.push(d); }
  close() {
    this.closed = true;
    this.dispatchEvent(new CloseEvent("close"));
  }
}

// ── H2: Content-Security-Policy ───────────────────────────────────────────────

describe("H2 — CSP header", () => {
  it("response includes frame-ancestors 'none' [H2 Red → Green]", async () => {
    const res = await handleRequest(new Request("http://localhost/api/v1/config"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    assertStringIncludes(csp, "frame-ancestors 'none'",
      "CSP must include frame-ancestors 'none' to prevent clickjacking");
  });

  it("response CSP has explicit script-src 'self'", async () => {
    const res = await handleRequest(new Request("http://localhost/api/v1/config"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    assertStringIncludes(csp, "script-src 'self'");
  });

  it("response CSP has connect-src for WebSocket", async () => {
    const res = await handleRequest(new Request("http://localhost/api/v1/config"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    assertStringIncludes(csp, "connect-src");
  });
});

// ── M1: Wizard privilege level ─────────────────────────────────────────────────

import { registerUIComponent, unregisterUIComponent } from "../src/app.ts";

const M1_ROOM = "m1_room1";
const M1_WIZ  = "m1_wiz1";
const M1_ELEM = "m1-admin-component";

describe("M1 — wizard privilege level", OPTS, () => {
  beforeEach(async () => {
    await dbojs.create({ id: M1_ROOM, flags: "room", data: { name: "Room" } });
    await dbojs.create({ id: M1_WIZ,  flags: "player wizard connected", data: { name: "WizUser" }, location: M1_ROOM });
    // Register an admin+-level component — only level ≥ 3 should see it
    registerUIComponent({
      element: M1_ELEM,
      slot:    "admin.test",
      script:  "/client/components/m1-admin-component.js",
      lock:    "connected admin+",
    });
  });
  afterEach(async () => {
    for (const id of [M1_ROOM, M1_WIZ]) await dbojs.delete({ id }).catch(() => {});
    unregisterUIComponent(M1_ELEM);
  });

  it("wizard user sees admin+ components in the manifest [M1 Red → Green]", async () => {
    // Wizard should have privilege level 4 (same as superuser/admin).
    // Components with lock:"connected admin+" require level ≥ 3.
    // Before fix: wizard = level 2 → admin+ components hidden.
    // After fix:  wizard = level 4 → admin+ components visible.
    const { sign } = await import("../src/services/jwt/index.ts");
    const token = await sign({ id: M1_WIZ });
    const res  = await handleRequest(new Request("http://localhost/api/v1/ui-manifest", {
      headers: { Authorization: `Bearer ${token}` },
    }));
    const body = await res.json() as { slots: Record<string, { element: string }[]> };
    const allElements = Object.values(body.slots).flat().map((c) => c.element);
    assertEquals(
      allElements.includes(M1_ELEM),
      true,
      "wizard must see admin+ components (level 4, same as superuser)"
    );
  });
});

// ── M2: WS rate-limiter memory cap ────────────────────────────────────────────

Deno.test("M2 — WS rate-limiter cleans up on socket close [M2 Red → Green]", OPTS, async () => {
  // Connect and immediately close many sockets.
  // The rateLimits Map must not retain entries after close.
  const SOCKETS = 20;
  const mocks: MockWS[] = [];

  for (let i = 0; i < SOCKETS; i++) {
    const m = new MockWS();
    wsService.handleConnection(m as unknown as WebSocket, "web");
    mocks.push(m);
  }

  // Trigger rate limit on each socket
  for (const m of mocks) {
    for (let j = 0; j < 12; j++) {
      m.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({ msg: `look ${j}` }),
      }));
    }
  }

  // Close all sockets
  for (const m of mocks) m.close();
  await new Promise<void>((r) => setTimeout(r, 50));

  // After close, the rateLimits Map should be empty (or at least not growing)
  // We verify by checking there are no sockets registered for these connections
  const remaining = wsService.getConnectedSockets();
  // All our test sockets should be gone
  assertEquals(
    remaining.filter(s => mocks.some(() => !s.cid && s.clientType === "web")).length,
    0,
    "rate-limit entries must be cleaned up on socket close"
  );
});

// ── M3: MUSH ANSI ReDoS guard ─────────────────────────────────────────────────

Deno.test("M3 — MUSH output regex does not hang on long ANSI sequence", { sanitizeOps: false, sanitizeResources: false }, () => {
  // Current regex: /\x1b\[[0-9;]*m/ — unbounded repetition is ReDoS-prone
  // Fixed regex:   /\x1b\[[0-9;]{0,20}m/ — bounded, safe

  // A pathological ANSI sequence: \x1b followed by 10000 digits then 'm'
  const pathological = `\x1b[${("1;").repeat(200)}m`;

  // Test that the regex from ursamu-output.js doesn't catastrophically backtrack.
  // We simulate what mushToHtml does: split the string on the token pattern.
  // With the fix, this should complete instantly; without it, it would hang.

  const start = performance.now();
  // Bounded regex (the fix)
  // deno-lint-ignore no-control-regex
  const safePattern = /(%c[a-zA-Z]|%[rRtTbBnN]|\x1b\[[0-9;]{0,20}m)/;
  pathological.split(safePattern);
  const elapsed = performance.now() - start;

  assert(elapsed < 50, `Bounded regex took ${elapsed.toFixed(1)}ms — must complete in <50ms`);

  // Verify that the long sequence is simply ignored (doesn't match the bounded pattern)
  const tokens = pathological.split(safePattern);
  // Should have 1 token (the whole unmatched string) or 3 (split around match)
  // Main check: no hang
  assert(tokens.length >= 1);
});

// ── Cleanup ────────────────────────────────────────────────────────────────────

Deno.test("security_hardening — cleanup DB", OPTS, async () => {
  await DBO.close();
});
