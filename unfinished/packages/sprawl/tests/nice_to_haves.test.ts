/**
 * Range, scene, street-tech, hordes, mission-ready helpers.
 */
import { assert, assertEquals } from "@std/assert";
import {
  bandAt,
  rangeAttackMod,
  weaponRangeM,
} from "../engine/range.ts";
import { resetSceneFlags } from "../engine/scene.ts";
import {
  hitHorde,
  hordeDs,
  spawnHorde,
} from "../engine/hordes.ts";
import {
  grantAp,
  missionCloseAp,
} from "../engine/advance-rules.ts";
import { defaultChar } from "../db/schemas.ts";
import { STREET_TECH_QUIRKS } from "../engine/catalog.ts";
import { addDot } from "../engine/dots.ts";
import { woundGlitch } from "../engine/damage.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("range bands PB close OOR", OPTS, () => {
  assertEquals(bandAt(1, 50), "pb");
  assertEquals(bandAt(4, 50), "close");
  assertEquals(bandAt(30, 50), "ok");
  assertEquals(bandAt(40, 50), "long");
  assertEquals(bandAt(60, 50), "oor");
  const pb = rangeAttackMod(1, {
    kind: "firearm",
    category: "handgun",
    slug: "pkd",
  });
  assertEquals(pb?.bonus, 3);
  assert(pb?.parts.some((p) => p.includes("pb")));
  const oor = rangeAttackMod(200, {
    kind: "firearm",
    category: "handgun",
    slug: "pkd",
    rangeM: 50,
  });
  assertEquals(oor?.glitch, 1);
  assertEquals(weaponRangeM({
    kind: "firearm",
    category: "rifle",
    slug: "kr-16",
  }), 300);
});

Deno.test("scene reset clears edge uses", OPTS, () => {
  let c = defaultChar("Neon");
  c.edgeUsedScene = true;
  c.edgeUsedEncounter = true;
  c = addDot(c, { kind: "fire", rounds: 2, dmg: 1 });
  const r = resetSceneFlags(c, { tickDots: true });
  assertEquals(r.next.edgeUsedScene, false);
  assertEquals(r.next.edgeUsedEncounter, false);
  assert(r.lines.some((L) => /edge/i.test(L)));
  assert(r.lines.some((L) => /DoT|fire/i.test(L)));
});

Deno.test("street-tech table present", OPTS, () => {
  assert(STREET_TECH_QUIRKS.length >= 8);
  const c = defaultChar("Neon");
  c.streetTechQuirks = ["tremors"];
  assertEquals(woundGlitch(c) >= 1, true);
});

Deno.test("hollywood spawn hit wipe", OPTS, () => {
  let c = defaultChar("Neon");
  c = spawnHorde(c, "gang", 5);
  assertEquals(hordeDs(c), 5);
  const h1 = hitHorde(c, 2)!;
  assertEquals(h1.after, 3);
  assertEquals(h1.dropped, 2);
  const h2 = hitHorde(h1.next, 10)!;
  assert(h2.wiped);
  assertEquals(hordeDs(h2.next), null);
});

Deno.test("mission close grants AP + level", OPTS, () => {
  const c = grantAp(defaultChar("Neon"), missionCloseAp());
  assertEquals(c.ap, missionCloseAp());
  assertEquals(c.apTotal, missionCloseAp());
});
