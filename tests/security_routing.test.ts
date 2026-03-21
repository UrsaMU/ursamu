/**
 * tests/security_routing.test.ts
 *
 * Security tests for HTTP route boundary vulnerabilities.
 * Each test starts RED (failing against the vulnerable code) and turns GREEN
 * after the corresponding fix is applied.
 */
import { assertEquals } from "@std/assert";
import { handleRequest } from "../src/app.ts";
import { DBO } from "../src/services/Database/database.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ---------------------------------------------------------------------------
// #16 — Auth route prefix missing "/" boundary
// Vulnerable:  path.startsWith("/api/v1/auth")  → /api/v1/authevil hits authHandler
// Fixed:       path === "/api/v1/auth" || path.startsWith("/api/v1/auth/")
// ---------------------------------------------------------------------------

Deno.test("#16 — GET /api/v1/authevil must return 404, not be handled by authHandler", OPTS, async () => {
  // authHandler returns 405 for non-POST requests, so if routing is wrong the
  // status will be 405. After the fix it must be 404.
  const req = new Request("http://localhost/api/v1/authevil", { method: "GET" });
  const res = await handleRequest(req, "127.0.0.1");
  assertEquals(res.status, 404);
});

Deno.test("#16 — GET /api/v1/authorize-anything must return 404", OPTS, async () => {
  const req = new Request("http://localhost/api/v1/authorize-anything", { method: "GET" });
  const res = await handleRequest(req, "127.0.0.1");
  assertEquals(res.status, 404);
});

// ---------------------------------------------------------------------------
// #17 — Config/connect/welcome routes missing "/" boundary
// Vulnerable:  path.startsWith("/api/v1/config")  → /api/v1/configevil/connect hits configHandler
//              which then calls Deno.readTextFile() on the connect-text path
// Fixed:       path === "/api/v1/config" || path.startsWith("/api/v1/config/") etc.
// ---------------------------------------------------------------------------

Deno.test("#17 — GET /api/v1/configevil must return 404, not route to configHandler", OPTS, async () => {
  const req = new Request("http://localhost/api/v1/configevil", { method: "GET" });
  const res = await handleRequest(req, "127.0.0.1");
  assertEquals(res.status, 404);
});

Deno.test("#17 — GET /api/v1/configevil/connect must return 404 (not trigger file read)", OPTS, async () => {
  // The danger: startsWith("/api/v1/config") + endsWith("/connect") inside configHandler
  // causes an arbitrary file read. After fix this path never reaches configHandler.
  const req = new Request("http://localhost/api/v1/configevil/connect", { method: "GET" });
  const res = await handleRequest(req, "127.0.0.1");
  assertEquals(res.status, 404);
});

// Positive — legitimate paths must still work
Deno.test("#16/#17 — legitimate /api/v1/auth POST still reaches authHandler (returns 400, not 404)", OPTS, async () => {
  const req = new Request("http://localhost/api/v1/auth", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "Content-Type": "application/json" },
  });
  const res = await handleRequest(req, "127.0.0.1");
  // authHandler processes it (returns 400 for missing fields), NOT the 404 catch-all
  assertEquals(res.status !== 404, true);
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
Deno.test("security_routing cleanup", OPTS, async () => {
  await DBO.close();
});
