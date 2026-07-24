/**
 * [MEDIUM] config.sample.json taught corsOrigins: "*".
 */
import { assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test(
  "[M3] config.sample.json does not default corsOrigins to *",
  OPTS,
  async () => {
    const raw = await Deno.readTextFile(
      new URL("../config.sample.json", import.meta.url),
    );
    const cfg = JSON.parse(raw) as {
      server?: { corsOrigins?: string };
    };
    assertEquals(cfg.server?.corsOrigins === "*", false);
    assertEquals(typeof cfg.server?.corsOrigins, "string");
  },
);
