/**
 * Site runtime must be process-global so theme hot-reload works when
 * @ursamu/web and the site plugin resolve different module URLs.
 */
import { assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  getSiteRuntime,
  liveSkinHref,
  setSiteRuntime,
} from "../src/static.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("setSiteRuntime is visible via getSiteRuntime", OPTS, () => {
  setSiteRuntime({ skin: "changeling", title: "T" });
  const rt = getSiteRuntime();
  assertEquals(rt.cfg.skin, "changeling");
  assertEquals(rt.cfg.title, "T");
  assertEquals(rt.gen >= 1, true);
});

Deno.test("liveSkinHref includes generation bust", OPTS, () => {
  setSiteRuntime({ skin: "default" });
  const a = liveSkinHref();
  setSiteRuntime({ skin: "default" });
  const b = liveSkinHref();
  assertEquals(a.includes("/site/css/skins/default.css"), true);
  assertEquals(b.includes("g="), true);
  // gen bumped even when skin path unchanged
  assertEquals(a === b, false);
});

Deno.test(
  "globalThis runtime shared across symbol key",
  OPTS,
  () => {
    setSiteRuntime({ skin: "court", plainBg: true });
    const key = Symbol.for("ursamu.site.runtime");
    const g = globalThis as unknown as Record<
      symbol,
      { current: { cfg: { skin?: string } } }
    >;
    assertEquals(g[key]?.current?.cfg?.skin, "court");
    // Mutate holder the way a dual import would write
    g[key]!.current.cfg = { skin: "changeling" };
    assertEquals(getSiteRuntime().cfg.skin, "changeling");
  },
);
