// Fast Reflexes (1-3) adds dots to the Initiative pool.

import { assertEquals } from "@std/assert";
import { fastReflexesBonus } from "../src/combat/modifiers.ts";
import { defaultSheet } from "../src/stats/sheet.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("fastReflexesBonus: missing merit -> 0", OPTS, () => {
  const sheet = defaultSheet();
  assertEquals(fastReflexesBonus(sheet), 0);
});

Deno.test("fastReflexesBonus: 2 dots -> +2", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["fast reflexes"] = 2;
  assertEquals(fastReflexesBonus(sheet), 2);
});

Deno.test("fastReflexesBonus: clamps to 3", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["fast reflexes"] = 9;
  assertEquals(fastReflexesBonus(sheet), 3);
});

Deno.test("fastReflexesBonus: undefined sheet -> 0", OPTS, () => {
  assertEquals(fastReflexesBonus(undefined), 0);
});
