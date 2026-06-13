// Wound-penalty table tests.
//
// Covers the sheet-level helper (sheetWoundPenalty) which returns the
// positive 0..3 magnitude. The existing tests/health.test.ts cover the raw
// track-level woundPenalty(track, max) helper that returns 0/-1/-2/-3.

import { assertEquals } from "@std/assert";
import { sheetWoundPenalty } from "../src/health/index.ts";
import { defaultSheet, setTrait } from "../src/stats/index.ts";
import type { CofdSheet, HealthTrack } from "../src/stats/sheet.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function withHealth(
  stamina: number,
  size: number,
  track: HealthTrack,
): CofdSheet {
  let s = defaultSheet();
  s = setTrait(s, "stamina", stamina);
  s.advantages.size = size;
  s.health = track;
  return s;
}

const tt = (b = 0, l = 0, a = 0): HealthTrack => ({
  bashing: b,
  lethal: l,
  aggravated: a,
});

Deno.test("empty track -> 0", OPTS, () => {
  assertEquals(sheetWoundPenalty(withHealth(2, 5, tt())), 0);
});

Deno.test("max 7, 4 filled -> 0 (no rightmost-3 damaged)", OPTS, () => {
  assertEquals(sheetWoundPenalty(withHealth(2, 5, tt(4))), 0);
});

Deno.test("max 7, 5 filled -> 1", OPTS, () => {
  assertEquals(sheetWoundPenalty(withHealth(2, 5, tt(5))), 1);
});

Deno.test("max 7, 6 filled -> 2", OPTS, () => {
  assertEquals(sheetWoundPenalty(withHealth(2, 5, tt(6))), 2);
});

Deno.test("max 7, 7 filled (full) -> 3", OPTS, () => {
  assertEquals(sheetWoundPenalty(withHealth(2, 5, tt(7))), 3);
});

Deno.test("max 8, 6 filled -> 1", OPTS, () => {
  assertEquals(sheetWoundPenalty(withHealth(3, 5, tt(6))), 1);
});

Deno.test("max 8, 7 filled -> 2", OPTS, () => {
  assertEquals(sheetWoundPenalty(withHealth(3, 5, tt(7))), 2);
});

Deno.test("max 8, 8 filled -> 3", OPTS, () => {
  assertEquals(sheetWoundPenalty(withHealth(3, 5, tt(8))), 3);
});

Deno.test("mixed damage types still trigger penalty by total fill", OPTS, () => {
  // stamina+size=6. 1B+2L+2A = 5 filled => -2 magnitude.
  assertEquals(sheetWoundPenalty(withHealth(1, 5, tt(1, 2, 2))), 2);
});

Deno.test("aggravated alone in last box triggers worst -3", OPTS, () => {
  assertEquals(sheetWoundPenalty(withHealth(1, 5, tt(0, 0, 6))), 3);
});
