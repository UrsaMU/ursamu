/**
 * Death saves, massive damage, rest gates.
 */
import { assertEquals, assert } from "@std/assert";
import { defaultSheet, migrateSheet } from "../src/stats/dnd_sheet.ts";
import {
  applyDamage,
  applyHeal,
  isDead,
  isDying,
  isIncapacitated,
  longRest,
  rollDeathSave,
  shortRest,
  stabilize,
} from "../src/stats/vitality.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function sheet(hp = 10) {
  const s = migrateSheet(defaultSheet());
  s.hp = { max: hp, current: hp, temp: 0 };
  s.hitDice = { max: 4, current: 2 };
  s.classes = { Fighter: 4 };
  s.level = 4;
  return s;
}

Deno.test("damage drops to 0 and starts dying", OPTS, () => {
  const r = applyDamage(sheet(10), 10);
  assertEquals(r.sheet.hp.current, 0);
  assertEquals(isDying(r.sheet), true);
  assertEquals(isIncapacitated(r.sheet), true);
  assertEquals(r.instantDeath, false);
});

Deno.test("massive damage instant death", OPTS, () => {
  // 10 current, take 25 → overflow 15 >= max 10
  const r = applyDamage(sheet(10), 25);
  assertEquals(r.sheet.hp.current, 0);
  assertEquals(r.instantDeath, true);
  assertEquals(isDead(r.sheet), true);
});

Deno.test("temp HP absorbs before current", OPTS, () => {
  const s = sheet(10);
  s.hp.temp = 5;
  const r = applyDamage(s, 4);
  assertEquals(r.sheet.hp.temp, 1);
  assertEquals(r.sheet.hp.current, 10);
});

Deno.test("damage at 0 HP adds death failures", OPTS, () => {
  let s = sheet(10);
  s = applyDamage(s, 10).sheet;
  const r = applyDamage(s, 3);
  assertEquals(r.deathFailureAdded, 1);
  assertEquals(r.sheet.death?.failures, 1);
  const r2 = applyDamage(r.sheet, 1, { critical: true });
  assertEquals(r2.deathFailureAdded, 2);
  assertEquals(r2.sheet.death?.failures, 3);
  assertEquals(isDead(r2.sheet), true);
});

Deno.test("heal from 0 clears death track", OPTS, () => {
  let s = applyDamage(sheet(10), 10).sheet;
  s = applyDamage(s, 1).sheet; // 1 failure
  const h = applyHeal(s, 5);
  assertEquals(h.sheet.hp.current, 5);
  assertEquals(h.sheet.death?.dead, false);
  assertEquals(h.sheet.death?.failures, 0);
  assertEquals(isDying(h.sheet), false);
});

Deno.test("death save success/fail/nat20/nat1", OPTS, () => {
  let s = applyDamage(sheet(10), 10).sheet;

  // force fail
  let r = rollDeathSave(s, () => 0.0); // roll 1
  assertEquals(r.roll, 1);
  assertEquals(r.sheet.death?.failures, 2);

  s = applyDamage(sheet(10), 10).sheet;
  r = rollDeathSave(s, () => 0.99); // roll 20
  assertEquals(r.roll, 20);
  assertEquals(r.sheet.hp.current, 1);
  assertEquals(isDying(r.sheet), false);

  s = applyDamage(sheet(10), 10).sheet;
  r = rollDeathSave(s, () => 0.45); // ~10
  // 0.45 * 20 = 9 → floor+1 = 10 success
  assert(r.roll >= 10);
  assertEquals(r.sheet.death?.successes, 1);
});

Deno.test("three successes stabilize", OPTS, () => {
  let s = applyDamage(sheet(10), 10).sheet;
  for (let i = 0; i < 3; i++) {
    s = rollDeathSave(s, () => 0.5).sheet; // 11
  }
  assertEquals(s.death?.stable, true);
  assertEquals(isDying(s), false);
});

Deno.test("stabilize helper", OPTS, () => {
  let s = applyDamage(sheet(10), 10).sheet;
  const r = stabilize(s);
  assertEquals(r.sheet.death?.stable, true);
  assertEquals(r.sheet.hp.current, 0);
});

Deno.test("short rest spends HD and heals", OPTS, () => {
  const s = sheet(20);
  s.hp.current = 5;
  const r = shortRest(s, 1, () => 0.99); // max die
  assertEquals(r.ok, true);
  assert(r.sheet.hp.current > 5);
  assertEquals(r.sheet.hitDice.current, 1);
});

Deno.test("short rest blocked while dying", OPTS, () => {
  const s = applyDamage(sheet(10), 10).sheet;
  const r = shortRest(s, 1);
  assertEquals(r.ok, false);
});

Deno.test("long rest restores HP HD slots clears death", OPTS, () => {
  let s = sheet(20);
  s.hitDice.current = 0;
  s.spellSlotsMax[1] = 2;
  s.spellSlotsCurrent[1] = 0;
  s = applyDamage(s, 20).sheet; // 0 HP dying
  s = stabilize(s).sheet;
  assertEquals(s.death?.stable, true);
  const r = longRest(s);
  assertEquals(r.ok, true);
  assertEquals(r.sheet.hp.current, 20);
  assertEquals(r.sheet.spellSlotsCurrent[1], 2);
  assertEquals(r.sheet.death?.stable, false);
  assert(r.sheet.hitDice.current >= 1);
});

Deno.test("long rest blocked if dead", OPTS, () => {
  const s = applyDamage(sheet(10), 100).sheet;
  assertEquals(isDead(s), true);
  const r = longRest(s);
  assertEquals(r.ok, false);
});
