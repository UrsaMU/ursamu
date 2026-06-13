// Quick Draw -- instanced per weapon class (firearms / melee / thrown).

import { assertEquals } from "@std/assert";
import { hasMatchingQuickDraw } from "../src/combat/modifiers.ts";
import { defaultSheet } from "../src/stats/sheet.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("hasMatchingQuickDraw: missing -> false", OPTS, () => {
  const sheet = defaultSheet();
  assertEquals(hasMatchingQuickDraw(sheet, "firearms"), false);
});

Deno.test("hasMatchingQuickDraw: matching class -> true", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["quick draw:firearms"] = 1;
  assertEquals(hasMatchingQuickDraw(sheet, "firearms"), true);
});

Deno.test("hasMatchingQuickDraw: case-insensitive class", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["quick draw:melee"] = 1;
  assertEquals(hasMatchingQuickDraw(sheet, "Melee"), true);
});

Deno.test("hasMatchingQuickDraw: non-matching class -> false", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["quick draw:firearms"] = 1;
  assertEquals(hasMatchingQuickDraw(sheet, "melee"), false);
});

Deno.test("hasMatchingQuickDraw: empty class -> false", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["quick draw:firearms"] = 1;
  assertEquals(hasMatchingQuickDraw(sheet, ""), false);
  assertEquals(hasMatchingQuickDraw(sheet, null), false);
});

Deno.test("hasMatchingQuickDraw: undefined sheet -> false", OPTS, () => {
  assertEquals(hasMatchingQuickDraw(undefined, "firearms"), false);
});
