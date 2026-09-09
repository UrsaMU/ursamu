// tests/charms.test.ts -- WtA Spirit Charm catalog invariants.

import { assert, assertEquals } from "@std/assert";
import {
  allCharms,
  charmsForSpirit,
  getCharm,
  UNIVERSAL_CHARMS,
  WTA_CHARMS,
} from "../splats/wta/data/charms.ts";
import { WTA_SPIRITS } from "../splats/wta/data/spirits.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("WTA_CHARMS: >=20 entries, kebab slugs unique, key==slug", OPTS, () => {
  const xs = allCharms();
  assert(xs.length >= 20, `expected >=20 charms, got ${xs.length}`);
  const seen = new Set<string>();
  for (const [key, def] of Object.entries(WTA_CHARMS)) {
    assertEquals(key, def.slug, `key must equal slug for ${key}`);
    assert(/^[a-z0-9][a-z0-9-]*$/.test(def.slug), `bad slug: ${def.slug}`);
    assert(!seen.has(def.slug), `dup slug: ${def.slug}`);
    seen.add(def.slug);
    assert(def.name.length > 0, `name required: ${def.slug}`);
    assert(def.description.length > 0, `description required: ${def.slug}`);
  }
});

Deno.test("getCharm: prototype-pollution guard", OPTS, () => {
  assertEquals(getCharm("__proto__"), undefined);
  assertEquals(getCharm("constructor"), undefined);
  assertEquals(getCharm("toString"), undefined);
  assertEquals(getCharm("hasOwnProperty"), undefined);
  assertEquals(getCharm(""), undefined);
  // Non-string inputs
  // deno-lint-ignore no-explicit-any
  assertEquals(getCharm(null as any), undefined);
  // deno-lint-ignore no-explicit-any
  assertEquals(getCharm(undefined as any), undefined);
  // deno-lint-ignore no-explicit-any
  assertEquals(getCharm(123 as any), undefined);
  // Sanity: real lookup still works (case-insensitive, trimmed)
  assertEquals(getCharm("  Airt-Sense  ")?.slug, "airt-sense");
});

Deno.test("WTA_CHARMS: every roll pool is a parseable expression", OPTS, () => {
  const re = /^[A-Za-z][A-Za-z0-9+\- ]*$/;
  for (const def of allCharms()) {
    if (!def.roll) continue;
    assert(re.test(def.roll.pool), `bad pool on ${def.slug}: ${def.roll.pool}`);
    if (def.roll.difficulty !== undefined) {
      assert(def.roll.difficulty >= 2 && def.roll.difficulty <= 10,
        `${def.slug}: difficulty out of range`);
    }
  }
});

Deno.test("WTA_CHARMS: universal charms present", OPTS, () => {
  for (const slug of UNIVERSAL_CHARMS) {
    assert(getCharm(slug), `missing universal charm: ${slug}`);
  }
});

Deno.test("charmsForSpirit: includes universals", OPTS, () => {
  const stag = WTA_SPIRITS["stag"];
  assert(stag, "stag spirit must exist");
  const list = charmsForSpirit(stag);
  const slugs = new Set(list.map((c) => c.slug));
  for (const u of UNIVERSAL_CHARMS) {
    assert(slugs.has(u), `stag missing universal: ${u}`);
  }
});

Deno.test("charmsForSpirit: merges slug-matched named charms", OPTS, () => {
  // Grandfather Thunder lists "Lightning Bolt" -> blast-lightning alias.
  const gft = WTA_SPIRITS["grandfather-thunder"];
  assert(gft);
  const slugs = new Set(charmsForSpirit(gft).map((c) => c.slug));
  assert(slugs.has("blast-lightning"),
    `expected blast-lightning, got: ${[...slugs].join(",")}`);

  // Uktena lists "Solidify Reality" -> solidify-reality (direct match).
  const uktena = WTA_SPIRITS["uktena"];
  assert(uktena);
  const us = new Set(charmsForSpirit(uktena).map((c) => c.slug));
  assert(us.has("solidify-reality"),
    `expected solidify-reality, got: ${[...us].join(",")}`);

  // Chimera lists "Shapeshift" (direct match).
  const chimera = WTA_SPIRITS["chimera"];
  assert(chimera);
  const cs = new Set(charmsForSpirit(chimera).map((c) => c.slug));
  assert(cs.has("shapeshift"));
});

Deno.test("charmsForSpirit: tolerates empty/missing charms array", OPTS, () => {
  // deno-lint-ignore no-explicit-any
  const fake: any = { slug: "x", name: "X", type: "gaffling", rage: 1, gnosis: 1, willpower: 1, power: 1, charms: [], ban: "" };
  const list = charmsForSpirit(fake);
  assertEquals(list.length, UNIVERSAL_CHARMS.length);
});
