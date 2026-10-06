/** Rules math tests — Cinematic Unisystem. */
import { assertEquals } from "@std/assert";
import {
  attrCost,
  bestDefenseSkill,
  brainsScore,
  combatScore,
  dramaRemaining,
  lifePoints,
  muscleScore,
  skillCost,
  successLevels,
} from "../src/rules.ts";
import { blankChar, type ICinChar } from "../src/types.ts";
import { QUALITIES, SKILLS } from "../src/data.ts";

Deno.test("attrCost — 1pt/level to 5, 8 for 6", () => {
  assertEquals(attrCost(0), 0);
  assertEquals(attrCost(3), 3);
  assertEquals(attrCost(5), 5);
  assertEquals(attrCost(6), 8);
  assertEquals(attrCost(7), 11);
});

Deno.test("skillCost — 1pt/level to 5, +3 after", () => {
  assertEquals(skillCost(5), 5);
  assertEquals(skillCost(7), 11);
});

Deno.test("successLevels — chart", () => {
  assertEquals(successLevels(8), 0);
  assertEquals(successLevels(9), 1);
  assertEquals(successLevels(10), 1);
  assertEquals(successLevels(11), 2);
  assertEquals(successLevels(14), 3);
  assertEquals(successLevels(16), 4);
  assertEquals(successLevels(20), 5);
  assertEquals(successLevels(23), 6);
  assertEquals(successLevels(27), 8);
  assertEquals(successLevels(35), 10);
  assertEquals(successLevels(38), 11);
});

Deno.test("lifePoints — (Str+Con)x4+10, +3 per HTK", () => {
  const c = blankChar();
  c.attrs.strength = 3;
  c.attrs.constitution = 4;
  assertEquals(lifePoints(c), 38);
  assertEquals(lifePoints(c, 2), 44);
});

Deno.test("ability scores — Muscle/Combat/Brains", () => {
  assertEquals(muscleScore(5), 16);
  assertEquals(combatScore(4, [2, 2]), 12);
  assertEquals(brainsScore([2, 2, 2], [2]), 10);
});

Deno.test("dramaRemaining never negative", () => {
  const c = blankChar();
  c.dramaPoints = 10;
  c.dramaSpent = 12;
  assertEquals(dramaRemaining(c), 0);
});

Deno.test("bestDefenseSkill picks highest", () => {
  const c: ICinChar = blankChar();
  c.skills["kung-fu"] = 3;
  assertEquals(bestDefenseSkill(c), "kung-fu");
  c.skills["getting-medieval"] = 5;
  assertEquals(bestDefenseSkill(c), "getting-medieval");
});

Deno.test("data tables — slugs unique", () => {
  const slugs = new Set(QUALITIES.map((q) => q.slug));
  assertEquals(slugs.size, QUALITIES.length);
});
