/**
 * Structured +info lookup for web / HTTP.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  lookupInfo,
  stripMushCodes,
} from "../src/info/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("stripMushCodes removes color and %r", OPTS, () => {
  assertEquals(
    stripMushCodes("%ch%cyGiant%cn%rYou are huge."),
    "Giant\nYou are huge.",
  );
});

Deno.test("lookupInfo empty query returns usage", OPTS, () => {
  const r = lookupInfo("");
  assertEquals(r.ok, true);
  assertEquals(r.hits.length, 0);
  assertEquals(r.detail, null);
  assertStringIncludes(r.message ?? "", "Look up");
});

Deno.test("lookupInfo single merit hit has detail", OPTS, () => {
  const r = lookupInfo("giant");
  assertEquals(r.ok, true);
  assertEquals(r.hits.length >= 1, true);
  assertEquals(r.detail !== null, true);
  assertEquals(r.detail!.name.toLowerCase().includes("giant"), true);
  assertStringIncludes(r.detail!.text.toLowerCase(), "giant");
  // No raw MUSH codes in web payload
  assertEquals(/%c[a-z]/i.test(r.detail!.text), false);
});

Deno.test("lookupInfo unknown name", OPTS, () => {
  const r = lookupInfo("zzznomatchxyz");
  assertEquals(r.hits.length, 0);
  assertEquals(r.detail, null);
  assertStringIncludes(r.message ?? "", "No catalog");
});

Deno.test("lookupInfo vampire discipline", OPTS, () => {
  const r = lookupInfo("dominate");
  assertEquals(r.detail !== null, true);
  assertStringIncludes(
    (r.detail?.category ?? "").toLowerCase(),
    "discipline",
  );
});
