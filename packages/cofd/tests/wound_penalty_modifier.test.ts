// buildModifiers() applies the attacker's wound penalty when attackerSheet
// or attackerWoundPenalty is supplied.

import { assertEquals } from "@std/assert";
import { buildModifiers } from "../src/combat/modifiers.ts";
import { defaultSheet, setTrait } from "../src/stats/index.ts";
import type { CofdSheet } from "../src/stats/sheet.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function sheetAt(filled: number): CofdSheet {
  // stamina+size=6 by default.
  let s = defaultSheet();
  s = setTrait(s, "stamina", 1);
  s.advantages.size = 5;
  s.health = { bashing: filled, lethal: 0, aggravated: 0 };
  return s;
}

Deno.test("no attackerSheet -> wound penalty not applied", OPTS, () => {
  const m = buildModifiers({});
  assertEquals(m.poolMod, 0);
});

Deno.test("attackerSheet at 4/6 boxes (just into rightmost-3) -> -1", OPTS, () => {
  const m = buildModifiers({ attackerSheet: sheetAt(4) });
  assertEquals(m.poolMod, -1);
});

Deno.test("attackerSheet at 5/6 boxes -> -2", OPTS, () => {
  const m = buildModifiers({ attackerSheet: sheetAt(5) });
  assertEquals(m.poolMod, -2);
});

Deno.test("attackerSheet at 6/6 boxes (full) -> -3", OPTS, () => {
  const m = buildModifiers({ attackerSheet: sheetAt(6) });
  assertEquals(m.poolMod, -3);
});

Deno.test("explicit attackerWoundPenalty wins over attackerSheet", OPTS, () => {
  const m = buildModifiers({
    attackerSheet: sheetAt(6),
    attackerWoundPenalty: 1,
  });
  assertEquals(m.poolMod, -1);
});

Deno.test("attackerWoundPenalty is clamped to 0..3", OPTS, () => {
  assertEquals(buildModifiers({ attackerWoundPenalty: 99 }).poolMod, -3);
  assertEquals(buildModifiers({ attackerWoundPenalty: -5 }).poolMod, 0);
});

Deno.test("wound penalty stacks with other modifiers", OPTS, () => {
  // all-out (+2) + wound -2 = 0
  const m = buildModifiers({ allOut: true, attackerSheet: sheetAt(5) });
  assertEquals(m.poolMod, 0);
  assertEquals(m.attackerLosesDefense, true);
});
