// Tests for specified-target tilt thresholds and grapple state logic.
// Full command-flow grapple tests require encounter integration; the pure
// logic tests here cover checkSpecifiedTargetTilts.

import { assertEquals } from "@std/assert";
import { checkSpecifiedTargetTilts } from "../src/combat/tilts.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ---------------------------------------------------------------------------
// Specified-target tilt thresholds (CoFD 2e p.92)
// ---------------------------------------------------------------------------

Deno.test("arm wrack: net > stamina", OPTS, () => {
  assertEquals(checkSpecifiedTargetTilts(4, 3, 5, "arm"), ["arm-wrack"]);
});

Deno.test("arm wrack: net == stamina -> no tilt", OPTS, () => {
  assertEquals(checkSpecifiedTargetTilts(3, 3, 5, "arm"), []);
});

Deno.test("hand wrack mirrors arm threshold", OPTS, () => {
  assertEquals(checkSpecifiedTargetTilts(2, 1, 5, "hand"), ["arm-wrack"]);
});

Deno.test("leg wrack: net > stamina", OPTS, () => {
  assertEquals(checkSpecifiedTargetTilts(3, 2, 5, "leg"), ["leg-wrack"]);
});

Deno.test("leg wrack: net == stamina -> no tilt", OPTS, () => {
  assertEquals(checkSpecifiedTargetTilts(2, 2, 5, "leg"), []);
});

Deno.test("head stunned: net >= size", OPTS, () => {
  assertEquals(checkSpecifiedTargetTilts(5, 3, 5, "head"), ["stunned"]);
});

Deno.test("head stunned: net > size also triggers", OPTS, () => {
  assertEquals(checkSpecifiedTargetTilts(7, 3, 5, "head"), ["stunned"]);
});

Deno.test("head stunned: net < size -> no tilt", OPTS, () => {
  assertEquals(checkSpecifiedTargetTilts(4, 3, 5, "head"), []);
});

Deno.test("eye: blinded on any net > 0", OPTS, () => {
  assertEquals(checkSpecifiedTargetTilts(1, 3, 5, "eye"), ["blinded"]);
});

Deno.test("no tilt when net is 0", OPTS, () => {
  assertEquals(checkSpecifiedTargetTilts(0, 1, 5, "eye"), []);
});

Deno.test("heart strike: special key returned", OPTS, () => {
  assertEquals(checkSpecifiedTargetTilts(1, 3, 5, "heart"), ["heart-strike"]);
});

Deno.test("torso: no tilt regardless of damage", OPTS, () => {
  assertEquals(checkSpecifiedTargetTilts(10, 1, 5, "torso"), []);
});

Deno.test("no specified target: empty result", OPTS, () => {
  assertEquals(checkSpecifiedTargetTilts(10, 1, 5, undefined), []);
});
