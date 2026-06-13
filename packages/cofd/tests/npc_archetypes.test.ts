// Pure tests over the NPC archetype registry.

import { assert, assertEquals, assertExists } from "@std/assert";
import {
  archetypeHealthMax,
  archetypeKeys,
  getArchetype,
  NPC_ARCHETYPES,
  sheetFromArchetype,
} from "../src/npc/archetypes.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("archetype registry has the expected keys", OPTS, () => {
  const keys = archetypeKeys();
  for (const expected of ["thug", "cultist", "soldier", "beast", "lieutenant", "boss"]) {
    assert(keys.includes(expected), `missing archetype: ${expected}`);
  }
});

Deno.test("every archetype has required fields and sane ranges", OPTS, () => {
  for (const [key, a] of Object.entries(NPC_ARCHETYPES)) {
    assertEquals(a.key, key);
    assert(a.label.length > 0);
    assert(a.blurb.length > 0);
    assert(["minor", "major", "storyteller"].includes(a.tier), `${key} bad tier ${a.tier}`);
    assertEquals(a.size, 5);

    // Attributes: 1..5 each
    const attrs = a.attributes;
    for (const [name, v] of Object.entries(attrs)) {
      assert(v >= 1 && v <= 5, `${key}.${name}=${v} out of 1..5`);
    }
    // Skills: 0..5 each
    for (const [skill, v] of Object.entries(a.skills)) {
      assert(v >= 0 && v <= 5, `${key} skill ${skill}=${v} out of 0..5`);
    }
    // Integrity in 1..10
    assert(a.integrity >= 1 && a.integrity <= 10, `${key} integrity out of range`);

    // Sum check: minor NPCs should not exceed a soft cap.
    const attrSum = Object.values(attrs).reduce((s, n) => s + n, 0);
    // Storyteller-tier archetypes (PC-equivalent) may carry up to 38.
    const sumCap = a.tier === "storyteller" ? 40 : 36;
    assert(attrSum <= sumCap, `${key} attribute sum ${attrSum} exceeds ${sumCap}`);
    assert(attrSum >= 12, `${key} attribute sum ${attrSum} below 12 (humanoid min)`);
  }
});

Deno.test("getArchetype is case-insensitive and returns null for unknown", OPTS, () => {
  assertExists(getArchetype("thug"));
  assertExists(getArchetype("Thug"));
  assertExists(getArchetype("  CULTIST "));
  assertEquals(getArchetype("nonesuch"), null);
});

Deno.test("sheetFromArchetype builds a usable CofdSheet", OPTS, () => {
  const a = getArchetype("thug")!;
  const sheet = sheetFromArchetype(a);
  assertEquals(sheet.template, "mortal");
  assertEquals(sheet.attributes.strength, a.attributes.strength);
  assertEquals(sheet.attributes.dexterity, a.attributes.dexterity);
  assertEquals(sheet.attributes.composure, a.attributes.composure);
  // Willpower = Resolve + Composure
  assertEquals(sheet.advantages.willpowerMax, a.attributes.resolve + a.attributes.composure);
  assertEquals(sheet.advantages.willpowerCurrent, sheet.advantages.willpowerMax);
  // Size is humanoid
  assertEquals(sheet.advantages.size, 5);
  // Skills present
  assertEquals((sheet.skills as Record<string, number>).brawl, a.skills.brawl);
  // NPC marker
  assertEquals(sheet.npc.archetype, "thug");
  // Health max = stamina + size
  assertEquals(archetypeHealthMax(a), a.attributes.stamina + a.size);
});

Deno.test("sheetFromArchetype defaults non-listed skills to 0", OPTS, () => {
  const sheet = sheetFromArchetype(getArchetype("beast")!);
  // 'academics' isn't in the beast block.
  assertEquals((sheet.skills as Record<string, number>).academics, 0);
});
