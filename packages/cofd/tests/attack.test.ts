// Tests for attack pool builder and damage resolution.

import { assertEquals } from "@std/assert";
import { buildPool, computeDefense, dodgePool } from "../src/combat/pools.ts";
import { applyAttackDamage } from "../src/combat/damage.ts";
import { defaultSheet } from "../src/stats/index.ts";
import type { CofdSheet } from "../src/stats/sheet.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function makeSheet(overrides: Partial<CofdSheet> = {}): CofdSheet {
  const base = defaultSheet();
  return { ...base, ...overrides };
}

function withAttrs(attrs: Record<string, number>): CofdSheet {
  const s = makeSheet();
  for (const [k, v] of Object.entries(attrs)) {
    (s.attributes as Record<string, number>)[k] = v;
  }
  return s;
}

function withSkills(skills: Record<string, number>, base = makeSheet()): CofdSheet {
  const s = { ...base };
  s.skills = { ...base.skills };
  for (const [k, v] of Object.entries(skills)) {
    (s.skills as Record<string, number>)[k] = v;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Pool selection
// ---------------------------------------------------------------------------

Deno.test("unarmed pool: Strength+Brawl", OPTS, () => {
  const sheet = withSkills({ brawl: 2 }, withAttrs({ strength: 3 }));
  const result = buildPool(sheet, "unarmed", {}, 0);
  assertEquals(result.base, 5); // 3+2
  assertEquals(result.formula, "Strength+Brawl");
});

Deno.test("melee pool: Strength+Weaponry", OPTS, () => {
  const sheet = withSkills({ weaponry: 3 }, withAttrs({ strength: 2 }));
  const result = buildPool(sheet, "melee", {}, 0);
  assertEquals(result.base, 5); // 2+3
  assertEquals(result.formula, "Strength+Weaponry");
});

Deno.test("ranged pool: Dex+Firearms", OPTS, () => {
  const sheet = withSkills({ firearms: 2 }, withAttrs({ dexterity: 3 }));
  const result = buildPool(sheet, "ranged", {}, 5); // defense is irrelevant
  assertEquals(result.base, 5); // 3+2
  assertEquals(result.defenseApplied, 0); // ranged ignores defense
  assertEquals(result.formula, "Dexterity+Firearms");
});

Deno.test("thrown pool: Dex+Athletics", OPTS, () => {
  const sheet = withSkills({ athletics: 1 }, withAttrs({ dexterity: 3 }));
  const result = buildPool(sheet, "thrown", {}, 0);
  assertEquals(result.base, 4); // 3+1
  assertEquals(result.formula, "Dexterity+Athletics");
});

// ---------------------------------------------------------------------------
// Defense application
// ---------------------------------------------------------------------------

Deno.test("unarmed subtracts target Defense", OPTS, () => {
  const sheet = withSkills({ brawl: 2 }, withAttrs({ strength: 3 }));
  const result = buildPool(sheet, "unarmed", {}, 2); // defense = 2
  assertEquals(result.defenseApplied, 2);
  assertEquals(result.total, 3); // 5-2
});

Deno.test("all-out attack: target Defense bypassed in opts", OPTS, () => {
  const sheet = withSkills({ brawl: 2 }, withAttrs({ strength: 3 }));
  // allOut reduces targetDefenseMod (it's handled by setting defense to 0 in command;
  // here we pass 0 directly to simulate that).
  const result = buildPool(sheet, "unarmed", { allOut: true }, 0);
  assertEquals(result.defenseApplied, 0);
  assertEquals(result.mods.attackerLosesDefense, true);
  // Pool should include the +2 all-out bonus.
  assertEquals(result.total, 7); // 5 base + 2 all-out
});

Deno.test("surprised target: Defense = 0", OPTS, () => {
  const sheet = withSkills({ brawl: 0 }, withAttrs({ strength: 3 }));
  const result = buildPool(sheet, "unarmed", { targetSurprised: true }, 5);
  assertEquals(result.defenseApplied, 0);
});

// ---------------------------------------------------------------------------
// Dodge
// ---------------------------------------------------------------------------

Deno.test("computeDefense: lower of Dex/Wits + Athletics", OPTS, () => {
  const sheet = withSkills({ athletics: 2 }, withAttrs({ dexterity: 3, wits: 2 }));
  assertEquals(computeDefense(sheet), 4); // min(3,2)+2
});

Deno.test("dodgePool is 2x Defense", OPTS, () => {
  const sheet = withSkills({ athletics: 1 }, withAttrs({ dexterity: 2, wits: 3 }));
  assertEquals(dodgePool(sheet), 6); // min(2,3)+1 = 3; *2 = 6
});

// ---------------------------------------------------------------------------
// Damage: armor subtraction
// ---------------------------------------------------------------------------

Deno.test("general armor reduces bashing from melee", OPTS, () => {
  const sheet = makeSheet();
  const res = applyAttackDamage(sheet, 4, "bashing", 2, 0, false);
  assertEquals(res.netDamage, 2); // 4-2
  assertEquals(res.sheet.health!.bashing, 2);
});

Deno.test("ballistic armor reduces lethal from firearms", OPTS, () => {
  const sheet = makeSheet();
  const res = applyAttackDamage(sheet, 5, "lethal", 1, 3, true);
  assertEquals(res.netDamage, 2); // 5-3
  assertEquals(res.sheet.health!.lethal, 2);
});

Deno.test("general armor does not apply to firearm attacks", OPTS, () => {
  const sheet = makeSheet();
  const res = applyAttackDamage(sheet, 3, "lethal", 99, 0, true);
  assertEquals(res.netDamage, 3); // ballistic=0, so full 3
});

Deno.test("armor absorbs everything -> netDamage 0", OPTS, () => {
  const sheet = makeSheet();
  const res = applyAttackDamage(sheet, 2, "bashing", 5, 0, false);
  assertEquals(res.netDamage, 0);
  assertEquals(res.sheet.health!.bashing, 0);
});

// ---------------------------------------------------------------------------
// Beaten down / unconscious
// ---------------------------------------------------------------------------

Deno.test("beaten down when bashing strictly exceeds stamina", OPTS, () => {
  // Default sheet: stamina(1) + size(5) = max 6.
  const sheet = makeSheet(); // stamina = 1
  const res = applyAttackDamage(sheet, 2, "bashing", 0, 0, false); // 2 bashing > 1 stamina
  assertEquals(res.beatenDown, true);
  assertEquals(res.unconscious, false);
});

Deno.test("beaten down does NOT trigger when bashing damage <= stamina", OPTS, () => {
  const sheet = makeSheet(); // stamina = 1
  const res = applyAttackDamage(sheet, 1, "bashing", 0, 0, false); // 1 bashing <= 1 stamina
  assertEquals(res.beatenDown, false);
});

Deno.test("beaten down triggers when any lethal damage is taken", OPTS, () => {
  const sheet = makeSheet();
  const res = applyAttackDamage(sheet, 1, "lethal", 0, 0, false);
  assertEquals(res.beatenDown, true);
});

Deno.test("unconscious when lethal fills track", OPTS, () => {
  const sheet = makeSheet();
  sheet.health = { bashing: 0, lethal: 5, aggravated: 0 };
  const res = applyAttackDamage(sheet, 1, "lethal", 0, 0, false);
  assertEquals(res.unconscious, true);
});

// ---------------------------------------------------------------------------
// Extra dice (willpower, aim)
// ---------------------------------------------------------------------------

Deno.test("extra dice added to pool total", OPTS, () => {
  const sheet = withAttrs({ strength: 2 }); // brawl=0 by default
  const result = buildPool(sheet, "unarmed", {}, 0, 3); // +3 WP dice
  assertEquals(result.total, 5); // 2+0+3
});
