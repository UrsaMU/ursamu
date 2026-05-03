// RED: When server.corsOrigins is set to "*", there is no operator warning
// logged. An admin who sets this by accident gets no indication that all
// origins are accepted. Fix: log a startup warning when wildcard CORS is active.

import { assertEquals } from "jsr:@std/assert@^1";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const SRC = new URL("../../src/app.ts", import.meta.url);

Deno.test(
  "app.ts emits a warning when CORS wildcard (*) is configured",
  OPTS,
  async () => {
    const src = await Deno.readTextFile(SRC);

    // Must have a warn/log call in the branch that handles configured === "*"
    // Check that the wildcard branch contains a console.warn
    const wildcardBlock = src.slice(
      src.indexOf('configured === "*"'),
      src.indexOf('configured === "*"') + 300,
    );

    const hasWarn = /console\.warn/.test(wildcardBlock);

    assertEquals(
      hasWarn,
      true,
      "MISSING: No operator warning when CORS wildcard (*) is active — misconfiguration goes unnoticed.",
    );
  },
);
