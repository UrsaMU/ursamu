/**
 * SECURITY [M-02] — CSP style-src 'unsafe-inline'
 *
 * 'unsafe-inline' in style-src permits CSS-based side-channel attacks:
 *   - Attribute selectors combined with @import or background-url can
 *     leak attribute values character-by-character to an attacker's server.
 *   - Malicious inline <style> blocks injected via stored XSS bypass the
 *     content-security-policy entirely for styling.
 *
 * Regression test: the CSP header emitted by handleRequest() MUST NOT
 * contain 'unsafe-inline' in the style-src directive.
 */

import { describe, it } from "jsr:@std/testing/bdd";
import { assertNotMatch } from "@std/assert";
import { handleRequest } from "../src/app.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("SECURITY [M-02]: CSP must not contain 'unsafe-inline' in style-src", OPTS, () => {
  it("[EXPLOIT] style-src 'unsafe-inline' present — allows CSS injection attacks", async () => {
    const req = new Request("http://localhost/api/v1/health", {
      method: "GET",
    });
    const res = await handleRequest(req, "127.0.0.1");
    const csp = res.headers.get("Content-Security-Policy") ?? "";

    // [RED] Before the fix: 'unsafe-inline' is present in style-src.
    // After the fix: this assertion should pass (no 'unsafe-inline').
    assertNotMatch(
      csp,
      /style-src[^;]*'unsafe-inline'/,
      `[RED] CSP contains 'unsafe-inline' in style-src — CSS injection risk: ${csp}`,
    );
  });
});
