/**
 * Level-up plan, ASI, spell pick.
 */
import { assertEquals, assert } from "@std/assert";
import {
  defaultSheet,
  migrateSheet,
} from "../src/stats/dnd_sheet.ts";
import {
  applyAsiChoice,
  applyLevelCore,
  applySpellPick,
  formatLevelReady,
  isAsiLevel,
  planLevelUp,
} from "../src/stats/levelup.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("ASI levels match PHB", OPTS, () => {
  assertEquals(isAsiLevel(4), true);
  assertEquals(isAsiLevel(5), false);
  assertEquals(isAsiLevel(19), true);
});

Deno.test("planLevelUp gates on XP", OPTS, () => {
  const s = migrateSheet(defaultSheet());
  s.xp = 0;
  s.level = 1;
  s.classes = { Fighter: 1 };
  const p = planLevelUp(s, "fighter");
  assert(!("error" in p));
  assertEquals(p.canLevel, false);
  s.xp = 300;
  const p2 = planLevelUp(s, "fighter");
  assert(!("error" in p2));
  assertEquals(p2.canLevel, true);
  assertEquals(p2.nextLevel, 2);
  assert(p2.hpGain >= 1);
});

Deno.test("applyLevelCore bumps HP and flags ASI at 4", OPTS, () => {
  let s = migrateSheet(defaultSheet());
  s.xp = 2700;
  s.level = 3;
  s.classes = { Fighter: 3 };
  s.hp = { max: 28, current: 28, temp: 0 };
  const plan = planLevelUp(s, "fighter");
  assert(!("error" in plan));
  assertEquals(plan.nextLevel, 4);
  assertEquals(plan.needsAsi, true);
  s = applyLevelCore(s, plan);
  assertEquals(s.level, 4);
  assert(s.hp.max > 28);
  // deno-lint-ignore no-explicit-any
  assertEquals((s as any).pendingAsi, true);
  const asi = applyAsiChoice(s, {
    type: "asi",
    ability: "strength",
    amount: 2,
  });
  assertEquals(asi.ok, true);
  assertEquals(asi.sheet.abilities.strength, 12); // default 10+2
  // deno-lint-ignore no-explicit-any
  assertEquals((asi.sheet as any).pendingAsi, undefined);
});

Deno.test("spell pick adds known spell", OPTS, () => {
  let s = migrateSheet(defaultSheet());
  s.spells = [];
  const r = applySpellPick(s, "magic missile");
  assertEquals(r.ok, true);
  assert(r.sheet.spells.includes("magic_missile"));
});

Deno.test("formatLevelReady when ready", OPTS, () => {
  const s = migrateSheet(defaultSheet());
  s.xp = 300;
  s.level = 1;
  s.classes = { Fighter: 1 };
  const msg = formatLevelReady(s);
  assert(msg.includes("+level") || msg.includes("Ready"));
});
