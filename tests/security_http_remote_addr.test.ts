/**
 * [HIGH] Auth routes ignored real client IP (always "unknown").
 *
 * Verifies formatRemoteAddr + that registerRoute handlers receive
 * the remoteAddr third argument from the HTTP layer.
 */
import { assertEquals } from "@std/assert";
import { formatRemoteAddr } from "@ursamu/core";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("[H3] formatRemoteAddr formats tcp NetAddr", OPTS, () => {
  const addr = {
    transport: "tcp" as const,
    hostname: "203.0.113.10",
    port: 54321,
  };
  assertEquals(formatRemoteAddr(addr), "203.0.113.10:54321");
});

Deno.test("[H3] formatRemoteAddr unknown when missing", OPTS, () => {
  assertEquals(formatRemoteAddr(undefined), "unknown");
});

Deno.test(
  "[H3] registerRoute auth handlers pass remoteAddr in source",
  OPTS,
  async () => {
    const src = await Deno.readTextFile(
      new URL(
        "../packages/mush/src/routes/index.ts",
        import.meta.url,
      ),
    );
    // Must thread addr into authHandler, not call authHandler(req) alone.
    assertEquals(
      /registerRoute\(\s*"POST",\s*"\/api\/v1\/login"[\s\S]*?authHandler\(req,\s*addr/.test(
        src,
      ),
      true,
      "login route must pass remoteAddr to authHandler",
    );
    assertEquals(
      /registerRoute\(\s*"POST",\s*"\/api\/v1\/register"[\s\S]*?authHandler\(req,\s*addr/.test(
        src,
      ),
      true,
      "register route must pass remoteAddr to authHandler",
    );
  },
);

Deno.test(
  "[H3] core HTTP requestHandler forwards remoteAddr to routes",
  OPTS,
  async () => {
    const src = await Deno.readTextFile(
      new URL(
        "../packages/core/src/server/http.ts",
        import.meta.url,
      ),
    );
    assertEquals(
      /handler\(req,\s*match\.params,\s*remoteAddr\)/.test(src),
      true,
      "match handler must receive remoteAddr",
    );
    assertEquals(
      /_fallback\(req,\s*remoteAddr\)/.test(src),
      true,
      "fallback must receive remoteAddr",
    );
  },
);
