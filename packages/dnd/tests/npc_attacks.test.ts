import { assertEquals, assert } from "@std/assert";
import {
  attacksFromTemplate,
  isNaturalWeaponName,
  pickAttack,
  rollDamageFormula,
} from "../src/combat/npc-attacks.ts";
import { NPC_TEMPLATES } from "../src/data/catalog.ts";
import { defaultSheet } from "../src/stats/dnd_sheet.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("wolf bite is natural sheet attack", OPTS, () => {
  const t = NPC_TEMPLATES.wolf;
  assert(t);
  const atks = attacksFromTemplate(t);
  assertEquals(atks.length, 1);
  assertEquals(atks[0].name, "Bite");
  assertEquals(atks[0].natural, true);
  assertEquals(atks[0].damage, "2d4");
});

Deno.test("goblin scimitar not natural", OPTS, () => {
  const atks = attacksFromTemplate(NPC_TEMPLATES.goblin);
  assertEquals(atks[0].name, "Scimitar");
  assertEquals(atks[0].natural, false);
});

Deno.test("isNaturalWeaponName", OPTS, () => {
  assert(isNaturalWeaponName("Bite"));
  assert(isNaturalWeaponName("Claw"));
  assert(!isNaturalWeaponName("Scimitar"));
  assert(!isNaturalWeaponName("Longsword"));
});

Deno.test("pickAttack by id", OPTS, () => {
  const s = defaultSheet();
  // deno-lint-ignore no-explicit-any
  (s as any).attacks = attacksFromTemplate(NPC_TEMPLATES.wolf);
  assertEquals(pickAttack(s, "bite").name, "Bite");
});

Deno.test("rollDamageFormula 2d4", OPTS, () => {
  const r = rollDamageFormula("2d4");
  assert(r.total >= 2 && r.total <= 8);
});
