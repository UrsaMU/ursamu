// Tests for the pure attack modifier stack (src/combat/modifiers.ts).

import { assertEquals } from "@std/assert";
import { buildModifiers } from "../src/combat/modifiers.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("no options -> zero modifiers", OPTS, () => {
  const m = buildModifiers({});
  assertEquals(m.poolMod, 0);
  assertEquals(m.targetDefenseMod, 0);
  assertEquals(m.coverMod, 0);
  assertEquals(m.targetSurprised, false);
  assertEquals(m.attackerLosesDefense, false);
});

Deno.test("all-out: +2 pool, attacker loses Defense", OPTS, () => {
  const m = buildModifiers({ allOut: true });
  assertEquals(m.poolMod, 2);
  assertEquals(m.attackerLosesDefense, true);
});

Deno.test("charge: +2 pool, attacker loses Defense", OPTS, () => {
  const m = buildModifiers({ charge: true });
  assertEquals(m.poolMod, 2);
  assertEquals(m.attackerLosesDefense, true);
});

Deno.test("all-out + charge: +2 (not +4), attacker loses Defense", OPTS, () => {
  const m = buildModifiers({ allOut: true, charge: true });
  assertEquals(m.poolMod, 2);
  assertEquals(m.attackerLosesDefense, true);
});

Deno.test("offhand: -2 pool", OPTS, () => {
  const m = buildModifiers({ offhand: true });
  assertEquals(m.poolMod, -2);
});

Deno.test("pulling blow: +1 target Defense penalty", OPTS, () => {
  const m = buildModifiers({ pulling: { max: 2 } });
  assertEquals(m.targetDefenseMod, 1);
});

Deno.test("burst-short: +1", OPTS, () => {
  assertEquals(buildModifiers({ burstShort: true }).poolMod, 1);
});

Deno.test("burst-med: +2", OPTS, () => {
  assertEquals(buildModifiers({ burstMed: true }).poolMod, 2);
});

Deno.test("burst-long: +3", OPTS, () => {
  assertEquals(buildModifiers({ burstLong: true }).poolMod, 3);
});

Deno.test("aim: banked bonus capped at 3", OPTS, () => {
  assertEquals(buildModifiers({ aim: 1 }).poolMod, 1);
  assertEquals(buildModifiers({ aim: 3 }).poolMod, 3);
  assertEquals(buildModifiers({ aim: 5 }).poolMod, 3); // capped
});

Deno.test("into-melee: -2 per bystander", OPTS, () => {
  assertEquals(buildModifiers({ intoMelee: 1 }).poolMod, -2);
  assertEquals(buildModifiers({ intoMelee: 3 }).poolMod, -6);
});

Deno.test("target concealment level 2: -2", OPTS, () => {
  assertEquals(buildModifiers({ targetConcealment: 2 }).poolMod, -2);
});

Deno.test("cover mod is negative Durability", OPTS, () => {
  assertEquals(buildModifiers({ targetCover: 3 }).coverMod, -3);
});

Deno.test("target surprised: flag set", OPTS, () => {
  assertEquals(buildModifiers({ targetSurprised: true }).targetSurprised, true);
});

Deno.test("target prone ranged: -2", OPTS, () => {
  assertEquals(buildModifiers({ targetProne: true, pool: "ranged" }).poolMod, -2);
});

Deno.test("target prone melee: +2", OPTS, () => {
  assertEquals(buildModifiers({ targetProne: true, pool: "melee" }).poolMod, 2);
});

Deno.test("specified arm: -2", OPTS, () => {
  assertEquals(buildModifiers({ specified: "arm" }).poolMod, -2);
});

Deno.test("specified head: -3", OPTS, () => {
  assertEquals(buildModifiers({ specified: "head" }).poolMod, -3);
});

Deno.test("specified eye: -5", OPTS, () => {
  assertEquals(buildModifiers({ specified: "eye" }).poolMod, -5);
});

Deno.test("specified torso: -1", OPTS, () => {
  assertEquals(buildModifiers({ specified: "torso" }).poolMod, -1);
});
