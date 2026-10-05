// Iron Stamina (1-3): reduces wound penalty toward zero, never positive.

import { assertEquals } from "@std/assert";
import { ironStaminaReducedPenalty } from "../src/combat/modifiers.ts";
import { defaultSheet } from "../src/stats/sheet.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("ironStamina: no merit, full -3 penalty stands", OPTS, () => {
  const sheet = defaultSheet();
  assertEquals(ironStaminaReducedPenalty(sheet, -3), -3);
});

Deno.test("ironStamina: 1 dot, -3 -> -2", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["iron stamina"] = 1;
  assertEquals(ironStaminaReducedPenalty(sheet, -3), -2);
});

Deno.test("ironStamina: 3 dots, -2 -> 0 (clamped, never positive)", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["iron stamina"] = 3;
  assertEquals(ironStaminaReducedPenalty(sheet, -2), 0);
});

Deno.test("ironStamina: 3 dots, -1 -> 0 not +2", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["iron stamina"] = 3;
  assertEquals(ironStaminaReducedPenalty(sheet, -1), 0);
});

Deno.test("ironStamina: no penalty (0) -> 0", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["iron stamina"] = 2;
  assertEquals(ironStaminaReducedPenalty(sheet, 0), 0);
});

Deno.test("ironStamina: dots clamped to 3", OPTS, () => {
  const sheet = defaultSheet();
  sheet.merits["iron stamina"] = 99;
  assertEquals(ironStaminaReducedPenalty(sheet, -3), 0);
});
