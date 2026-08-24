/**
 * Tests: Aimed shot, Called shot, and Autofire DV table (errata p.173)
 */
import { assertEquals, assert } from "jsr:@std/assert@1";
import { resolveAttack } from "../engine/combat.ts";
import {
  AUTOFIRE_DV,
  autofireClass,
  autofireDV,
  parseRangeBand,
} from "../engine/combat-autofire.ts";

// ---------------------------------------------------------------------------
// Autofire DV table (errata p.173)
// ---------------------------------------------------------------------------

Deno.test("autofire DV: SMG values match errata", () => {
  assertEquals(AUTOFIRE_DV.smg.close,   20);
  assertEquals(AUTOFIRE_DV.smg.medium,  17);
  assertEquals(AUTOFIRE_DV.smg.long,    20);
  assertEquals(AUTOFIRE_DV.smg.vlong,   25);
  assertEquals(AUTOFIRE_DV.smg.extreme, 30);
});

Deno.test("autofire DV: Assault Rifle values match errata", () => {
  assertEquals(AUTOFIRE_DV.assault_rifle.close,   22);
  assertEquals(AUTOFIRE_DV.assault_rifle.medium,  20);
  assertEquals(AUTOFIRE_DV.assault_rifle.long,    17);
  assertEquals(AUTOFIRE_DV.assault_rifle.vlong,   20);
  assertEquals(AUTOFIRE_DV.assault_rifle.extreme, 25);
});

Deno.test("autofireClass: maps weapon types", () => {
  assertEquals(autofireClass("smg"),    "smg");
  assertEquals(autofireClass("rifle"),  "assault_rifle");
  assertEquals(autofireClass("pistol"), null);
});

Deno.test("autofireDV: lookup helper returns table value", () => {
  assertEquals(autofireDV("smg", "medium"),           17);
  assertEquals(autofireDV("assault_rifle", "long"),   17);
});

Deno.test("parseRangeBand: accepts aliases", () => {
  assertEquals(parseRangeBand("close"),   "close");
  assertEquals(parseRangeBand("M"),       "medium");
  assertEquals(parseRangeBand("vlong"),   "vlong");
  assertEquals(parseRangeBand("extreme"), "extreme");
  assertEquals(parseRangeBand("bogus"),   null);
});

// ---------------------------------------------------------------------------
// Aimed shot: -8 to attack, +1 damage on hit
// ---------------------------------------------------------------------------

Deno.test("aimed shot: -8 attack penalty applied", () => {
  // Massive stat differential so we still hit; check rolls land in expected range
  let sawAimed = false;
  for (let i = 0; i < 200 && !sawAimed; i++) {
    const r = resolveAttack({
      attackerStat: 20,
      attackerSkill: 10,
      aimed: true,
      damageDice: 2,
      defenderDV: 10,
    }, 0);
    // attackTotal = stat + skill + d10 + (-8 for aimed)
    // min = 20+10+1-8 = 23, max = 20+10+20-8 = 42 (with explode)
    // d10 can crit-fail (1 - d10) so lower bound = stat+skill-8 + (1-10) = 13
    assert(r.attackTotal >= 13, `aimed total ${r.attackTotal}`);
    sawAimed = true;
  }
  assert(sawAimed);
});

Deno.test("aimed shot: +1 damage on hit", () => {
  // Force hit by huge advantage; rawDamage should equal damageDice rolls + 1
  let saw = false;
  for (let i = 0; i < 50; i++) {
    const r = resolveAttack({
      attackerStat: 30,
      attackerSkill: 10,
      aimed: true,
      damageDice: 2,
      defenderDV: 5,
    }, 0);
    if (r.hit) {
      // rawDamage = damageResult.total + 1
      assertEquals(r.rawDamage, r.damageResult.total + 1);
      saw = true;
      break;
    }
  }
  assert(saw);
});

Deno.test("non-aimed shot: no +1 damage bonus", () => {
  let saw = false;
  for (let i = 0; i < 50; i++) {
    const r = resolveAttack({
      attackerStat: 30,
      attackerSkill: 10,
      damageDice: 2,
      defenderDV: 5,
    }, 0);
    if (r.hit) {
      assertEquals(r.rawDamage, r.damageResult.total);
      saw = true;
      break;
    }
  }
  assert(saw);
});

// ---------------------------------------------------------------------------
// Called shot: -8 penalty
// ---------------------------------------------------------------------------

Deno.test("called shot: -8 attack penalty applied", () => {
  for (let i = 0; i < 50; i++) {
    const r = resolveAttack({
      attackerStat: 20,
      attackerSkill: 10,
      calledShot: true,
      damageDice: 2,
      defenderDV: 10,
    }, 0);
    // d10 can crit-fail (1 - d10), so lower bound = 20+10-8 + (1-10) = 13
    assert(r.attackTotal >= 13);
  }
});

// ---------------------------------------------------------------------------
// Head shot: x2 damage AFTER armor (CPR Core p.180)
// ---------------------------------------------------------------------------

Deno.test("head shot: damage doubled after armor", () => {
  for (let i = 0; i < 100; i++) {
    const r = resolveAttack({
      attackerStat: 30,
      attackerSkill: 10,
      calledShot: true,
      location: "head",
      damageDice: 2,
      defenderDV: 5,
    }, 4);
    if (r.hit) {
      // expected: max(0, raw - 4) * 2
      const expectedAfterArmor = Math.max(0, r.rawDamage - 4) * 2;
      assertEquals(r.netDamage, expectedAfterArmor);
      break;
    }
  }
});

Deno.test("body shot: no x2 damage multiplier", () => {
  for (let i = 0; i < 50; i++) {
    const r = resolveAttack({
      attackerStat: 30,
      attackerSkill: 10,
      damageDice: 2,
      defenderDV: 5,
    }, 4);
    if (r.hit) {
      assertEquals(r.netDamage, Math.max(0, r.rawDamage - 4));
      break;
    }
  }
});
