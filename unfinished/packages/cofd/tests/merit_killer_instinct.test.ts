// Killer Instinct (1-3): +dots vs beaten-down or heavily-wounded targets.

import { assertEquals } from "@std/assert";
import { killerInstinctBonus, buildModifiers } from "../src/combat/modifiers.ts";
import { defaultSheet } from "../src/stats/sheet.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("killerInstinctBonus: no merit -> 0", OPTS, () => {
  const a = defaultSheet();
  const t = defaultSheet();
  t.tilts = [{ key: "beaten-down" }];
  assertEquals(killerInstinctBonus(a, t), 0);
});

Deno.test("killerInstinctBonus: merit but healthy target -> 0", OPTS, () => {
  const a = defaultSheet();
  a.merits["killer instinct"] = 2;
  const t = defaultSheet();
  assertEquals(killerInstinctBonus(a, t), 0);
});

Deno.test("killerInstinctBonus: beaten-down tilt -> +dots", OPTS, () => {
  const a = defaultSheet();
  a.merits["killer instinct"] = 2;
  const t = defaultSheet();
  t.tilts = [{ key: "beaten-down" }];
  assertEquals(killerInstinctBonus(a, t), 2);
});

Deno.test("killerInstinctBonus: explicit beaten-down flag -> +dots", OPTS, () => {
  const a = defaultSheet();
  a.merits["killer instinct"] = 1;
  const t = defaultSheet();
  assertEquals(killerInstinctBonus(a, t, true), 1);
});

Deno.test("killerInstinctBonus: half-health threshold -> +dots", OPTS, () => {
  const a = defaultSheet();
  a.merits["killer instinct"] = 3;
  const t = defaultSheet();
  // default Stamina 1 + Size 5 = 6 HP; >3 damage triggers
  t.health = { bashing: 4, lethal: 0, aggravated: 0 };
  assertEquals(killerInstinctBonus(a, t), 3);
});

Deno.test("buildModifiers: applies Killer Instinct via pool", OPTS, () => {
  const a = defaultSheet();
  a.merits["killer instinct"] = 2;
  const t = defaultSheet();
  t.tilts = [{ key: "beaten-down" }];
  const m = buildModifiers({ targetSheet: t }, a);
  assertEquals(m.poolMod, 2);
});
