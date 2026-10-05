// Pure-logic tests for +throw blast resolution and tag parsing.

import { assert, assertEquals } from "@std/assert";
import {
  computeBlastDamage,
  emptyTags,
  parseWeaponTags,
} from "../src/equipment/tags.ts";
import { lookupItem } from "../src/equipment/catalog.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ---------------------------------------------------------------------------
// parseWeaponTags
// ---------------------------------------------------------------------------

Deno.test("parseWeaponTags: empty string yields default tags", OPTS, () => {
  assertEquals(parseWeaponTags(""), emptyTags());
  assertEquals(parseWeaponTags(undefined), emptyTags());
});

Deno.test("parseWeaponTags: grenade frag tokens", OPTS, () => {
  const t = parseWeaponTags("thrown; blast 3; force 3; knockdown");
  assertEquals(t.blast, 3);
  assertEquals(t.force, 3);
  assertEquals(t.knockdown, true);
  assertEquals(t.thrown, true);
});

Deno.test("parseWeaponTags: stun grenade has force 0 but stun true", OPTS, () => {
  const t = parseWeaponTags("thrown; blast 3; force 0; stun");
  assertEquals(t.blast, 3);
  assertEquals(t.force, 0);
  assertEquals(t.stun, true);
});

Deno.test("parseWeaponTags: smoke grenade", OPTS, () => {
  const t = parseWeaponTags("thrown; blast 3; force 0; smoke");
  assertEquals(t.smoke, true);
  assertEquals(t.blast, 3);
});

Deno.test("parseWeaponTags: molotov burning", OPTS, () => {
  const t = parseWeaponTags("thrown; blast 2; force 2; burning");
  assertEquals(t.burning, true);
  assertEquals(t.force, 2);
});

Deno.test("parseWeaponTags: aerodynamic single weapon", OPTS, () => {
  const t = parseWeaponTags("thrown; aerodynamic");
  assertEquals(t.aerodynamic, true);
  assertEquals(t.blast, 0);
  assertEquals(t.thrown, true);
});

Deno.test("parseWeaponTags: again threshold parses", OPTS, () => {
  assertEquals(parseWeaponTags("9-again").again, 9);
  assertEquals(parseWeaponTags("8-again").again, 8);
  assertEquals(parseWeaponTags("").again, 10);
});

// ---------------------------------------------------------------------------
// computeBlastDamage
// ---------------------------------------------------------------------------

Deno.test("computeBlastDamage: successes > stamina deals full force", OPTS, () => {
  assertEquals(computeBlastDamage(5, 3, 3), 3);
  assertEquals(computeBlastDamage(4, 2, 4), 4);
});

Deno.test("computeBlastDamage: tie deals floor(force/2)", OPTS, () => {
  assertEquals(computeBlastDamage(3, 3, 3), 1); // floor(3/2)
  assertEquals(computeBlastDamage(3, 3, 4), 2); // floor(4/2)
  assertEquals(computeBlastDamage(2, 2, 5), 2); // floor(5/2)
});

Deno.test("computeBlastDamage: successes < stamina deals 0 (evaded)", OPTS, () => {
  assertEquals(computeBlastDamage(2, 4, 3), 0);
  assertEquals(computeBlastDamage(1, 3, 3), 0);
});

Deno.test("computeBlastDamage: 0 successes is always 0", OPTS, () => {
  assertEquals(computeBlastDamage(0, 0, 5), 0);
  assertEquals(computeBlastDamage(-1, 2, 5), 0);
});

Deno.test("computeBlastDamage: stun (force 0) deals no damage on hit", OPTS, () => {
  assertEquals(computeBlastDamage(5, 2, 0), 0);
});

// ---------------------------------------------------------------------------
// Catalog: grenade entries are present and parse correctly
// ---------------------------------------------------------------------------

Deno.test("catalog: grenade-frag-standard parses blast/force/knockdown", OPTS, () => {
  const r = lookupItem("grenade-frag-standard");
  assert(r);
  const entry = r!.entry as { special?: string };
  const t = parseWeaponTags(entry.special);
  assertEquals(t.blast, 10);
  assertEquals(t.force, 3);
  assertEquals(t.knockdown, true);
});

Deno.test("catalog: grenade-stun carries stun tag", OPTS, () => {
  const r = lookupItem("grenade-stun");
  assert(r);
  const t = parseWeaponTags((r!.entry as { special?: string }).special);
  assertEquals(t.stun, true);
});

Deno.test("catalog: grenade-smoke carries smoke tag", OPTS, () => {
  const r = lookupItem("grenade-smoke");
  assert(r);
  const t = parseWeaponTags((r!.entry as { special?: string }).special);
  assertEquals(t.smoke, true);
});

Deno.test("catalog: grenades have clip 1 (consumed on use)", OPTS, () => {
  const frag = lookupItem("grenade-frag-standard");
  assertEquals((frag!.entry as { clip?: number }).clip, 1);
});
