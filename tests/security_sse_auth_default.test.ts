/**
 * [MEDIUM] SSE /events auth defaulted off even in production.
 *
 * GREEN: production default (DENO_ENV=production) requires Bearer.
 */
import { assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test(
  "[M4] http.ts defaults requireAuthForSSE true in production",
  OPTS,
  async () => {
    const src = await Deno.readTextFile(
      new URL(
        "../packages/core/src/server/http.ts",
        import.meta.url,
      ),
    );
    assertEquals(
      /requireAuthForSSE[\s\S]{0,80}DENO_ENV[\s\S]{0,40}production/.test(src) ||
        /getConfig<boolean>\(\s*"server\.requireAuthForSSE"[\s\S]{0,60}production/
          .test(src),
      true,
      "requireAuthForSSE must default true when DENO_ENV=production",
    );
  },
);
