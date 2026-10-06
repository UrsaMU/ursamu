/** Validation tests — pools, caps, required fields. */
import { assertEquals } from "@std/assert";
import {
  checkRequired,
  validatePool,
  validateQuality,
  validateSkill,
  validateStat,
} from "../src/validation.ts";
import { blankChar, type ICinChar } from "../src/types.ts";

function heroChar(): ICinChar {
  const c = blankChar();
  c.type = "hero";
  for (const [k, v] of Object.entries({
    strength: 3,
    dexterity: 4,
    constitution: 3,
    intelligence: 3,
    perception: 3,
    willpower: 4,
  })) {
    c.attrs[k as keyof typeof c.attrs] = v;
  }
  c.skills["kung-fu"] = 4;
  c.skills["acrobatics"] = 3;
  return c;
}

Deno.test("validateStat — range and key checks", () => {
  assertEquals(validateStat("strength", 3), true);
  assertEquals(typeof validateStat("strength", 0), "string");
  assertEquals(validateStat("strength", 7), "Human maximum is 6");
  assertEquals(typeof validateStat("charisma", 3), "string");
  assertEquals(validateStat("dexterity", 6), true);
});

Deno.test("validateSkill — known slugs only", () => {
  assertEquals(validateSkill("kung-fu", 4), true);
  assertEquals(typeof validateSkill("gun-fu", 11), "string");
  assertEquals(typeof validateSkill("cooking", 2), "string");
});

Deno.test("validateQuality — kind enforcement", () => {
  assertEquals(validateQuality("athlete", "quality"), true);
  assertEquals(typeof validateQuality("athlete", "drawback"), "string");
  assertEquals(validateQuality("clown", "drawback"), true);
  assertEquals(typeof validateQuality("nope", "quality"), "string");
});

Deno.test("pool — hero char passes", () => {
  assertEquals(validatePool(heroChar()), true);
});

Deno.test("pool — over-budget attributes rejected", () => {
  const c = heroChar();
  c.attrs.strength = 5;
  c.attrs.dexterity = 5;
  const v = validatePool(c);
  assertEquals(typeof v, "string");
});

Deno.test("checkRequired — missing type listed", () => {
  const c = blankChar();
  const missing = checkRequired(c);
  assertEquals(
    missing.includes("character type (+chargen/type)"),
    true,
  );
});

Deno.test("checkRequired — complete char passes", () => {
  assertEquals(checkRequired(heroChar()), []);
});
