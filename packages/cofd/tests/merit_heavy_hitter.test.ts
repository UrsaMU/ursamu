// Heavy Hitter (3 dots, melee only) -- +1 raw hit when wielding melee.

import { assertEquals } from "@std/assert";
import { heavyHitterBonus } from "../src/combat/modifiers.ts";
import { defaultSheet } from "../src/stats/sheet.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("heavyHitter: no merit -> 0", OPTS, () => {
  const sheet = defaultSheet();
  assertEquals(heavyHitterBonus(sheet, false), 0);
});

Deno.test("heavyHitter: 3 dots, melee -> 1", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["heavy hitter"] = 3;
  assertEquals(heavyHitterBonus(sheet, false), 1);
});

Deno.test("heavyHitter: 3 dots, firearm -> 0", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["heavy hitter"] = 3;
  assertEquals(heavyHitterBonus(sheet, true), 0);
});

Deno.test("heavyHitter: 2 dots (sub-threshold) -> 0", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["heavy hitter"] = 2;
  assertEquals(heavyHitterBonus(sheet, false), 0);
});

Deno.test("heavyHitter: undefined sheet -> 0", OPTS, () => {
  assertEquals(heavyHitterBonus(undefined, false), 0);
});
