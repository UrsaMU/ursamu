// tests/realms.test.ts -- Umbral Realm catalog invariants + lookup.

import { assert, assertEquals } from "@std/assert";
import { allRealms, getRealm, realmsByDepth } from "../core/realms.ts";
import { WTA_REALMS } from "../splats/wta/data/realms.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("WTA_REALMS: 12+ entries, unique kebab slugs, both depths populated", OPTS, () => {
  const xs = allRealms();
  assert(xs.length >= 12, `expected >=12 realms, got ${xs.length}`);
  const slugs = new Set<string>();
  for (const r of xs) {
    assert(/^[a-z0-9][a-z0-9-]*$/.test(r.slug), `bad slug: ${r.slug}`);
    assert(!slugs.has(r.slug), `dup: ${r.slug}`);
    slugs.add(r.slug);
    assert(r.name.length > 0);
    assert(r.description.length > 0);
  }
  assert(realmsByDepth("near").length >= 3, "expected >=3 near-umbra realms");
  assert(realmsByDepth("deep").length >= 5, "expected >=5 deep-umbra realms");
});

Deno.test("WTA_REALMS: every entry's depth is 'near' or 'deep'", OPTS, () => {
  for (const r of allRealms()) {
    assert(r.depth === "near" || r.depth === "deep", `bad depth: ${r.depth}`);
  }
});

Deno.test("getRealm: own-property guard rejects prototype keys", OPTS, () => {
  assertEquals(getRealm("toString"), undefined);
  assertEquals(getRealm("__proto__"), undefined);
  assertEquals(getRealm("constructor"), undefined);
  assertEquals(getRealm(""), undefined);
});

Deno.test("getRealm: case-insensitive lookup on canonical slugs", OPTS, () => {
  const sample = Object.keys(WTA_REALMS)[0];
  assert(getRealm(sample) !== undefined);
  assert(getRealm(sample.toUpperCase()) !== undefined);
});

Deno.test("Penumbra is present as a near-umbra realm", OPTS, () => {
  const p = getRealm("penumbra");
  assert(p);
  assertEquals(p!.depth, "near");
});
