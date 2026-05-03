// RED: @avatar fetch has a DNS-rebinding TOCTOU window and allows redirects,
// creating an SSRF vector. A malicious server can redirect to a private IP
// after the DNS check passes. Fix: add redirect: "error" to prevent
// redirect-based bypass, and a fetch timeout to prevent slow-loris.

import { assertEquals } from "jsr:@std/assert@^1";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const SRC = new URL("../../src/commands/avatar.ts", import.meta.url);

Deno.test(
  "avatar fetch uses redirect:error to prevent redirect-based SSRF bypass",
  OPTS,
  async () => {
    const src = await Deno.readTextFile(SRC);

    const hasRedirectError = /redirect\s*:\s*["']error["']/.test(src);

    assertEquals(
      hasRedirectError,
      true,
      "VULNERABLE: fetch() called without redirect:'error' — attacker can redirect to private IP after DNS check.",
    );
  },
);

Deno.test(
  "avatar fetch uses AbortSignal timeout to prevent slow-loris DoS",
  OPTS,
  async () => {
    const src = await Deno.readTextFile(SRC);

    const hasTimeout =
      /AbortSignal\.timeout|signal\s*:\s*AbortSignal/.test(src);

    assertEquals(
      hasTimeout,
      true,
      "MISSING: fetch() has no timeout — slow response from remote server blocks the handler indefinitely.",
    );
  },
);
