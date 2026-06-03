/**
 * Security test — missing HTTP security headers
 *
 * Without X-Content-Type-Options, X-Frame-Options, Content-Security-Policy,
 * and Referrer-Policy, web clients are vulnerable to MIME sniffing,
 * clickjacking, and information leakage.
 *
 * Fix: add a security headers middleware that applies to every response.
 */
import { assertEquals } from "@std/assert";
import { requestHandler } from "../../src/server/http.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const REQUIRED = [
  "x-content-type-options",
  "x-frame-options",
  "content-security-policy",
  "referrer-policy",
];

Deno.test("HTTP security headers — /health response must include all security headers", OPTS, async () => {
  const res = await requestHandler(new Request("http://localhost/health"));

  for (const header of REQUIRED) {
    const val = res.headers.get(header);
    assertEquals(
      val !== null,
      true,
      `Missing security header: ${header}`,
    );
  }
});

Deno.test("HTTP security headers — 404 response must include security headers", OPTS, async () => {
  const res = await requestHandler(
    new Request("http://localhost/no-such-route"),
  );

  for (const header of REQUIRED) {
    assertEquals(
      res.headers.get(header) !== null,
      true,
      `Missing security header on 404: ${header}`,
    );
  }
});
