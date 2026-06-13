// Tests for tiered NPC builder, dread powers catalog, and derived stats.

import { assert, assertEquals, assertExists } from "@std/assert";
import {
  archetypeKeys,
  getArchetype,
  NPC_TIERS,
  sheetDefense,
  sheetFromArchetype,
  sheetHealthMax,
  sheetInitiative,
  sheetSpeed,
  tierMeritCap,
  tierPowerCap,
} from "../src/npc/archetypes.ts";
import {
  getDreadPower,
  listDreadPowers,
  tierMeetsPower,
} from "../src/npc/dread.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("new archetypes are registered", OPTS, () => {
  const keys = archetypeKeys();
  for (const k of ["hunter", "professional", "occultist", "ghost", "spirit", "mastermind"]) {
    assert(keys.includes(k), `missing archetype: ${k}`);
  }
});

Deno.test("tiers are ordered minor < major < storyteller", OPTS, () => {
  assertEquals(NPC_TIERS, ["minor", "major", "storyteller"] as const);
  assert(tierPowerCap("minor") < tierPowerCap("major"));
  assert(tierPowerCap("major") < tierPowerCap("storyteller"));
  assert(tierMeritCap("minor") < tierMeritCap("major"));
});

Deno.test("sheetFromArchetype scales when tier overrides default", OPTS, () => {
  const thug = getArchetype("thug")!;
  const minor = sheetFromArchetype(thug);
  const major = sheetFromArchetype(thug, "major");
  // Major tier should bump skills relative to minor
  const minorBrawl = (minor.skills as Record<string, number>).brawl;
  const majorBrawl = (major.skills as Record<string, number>).brawl;
  assert(majorBrawl >= minorBrawl);
  assertEquals(major.npc.tier, "major");
});

Deno.test("minor tier strips merits and caps powers", OPTS, () => {
  const mm = getArchetype("mastermind")!;  // default storyteller
  const minored = sheetFromArchetype(mm, "minor");
  assertEquals(Object.keys(minored.merits).length, 0);
  assert(minored.npc.dreadPowers.length <= tierPowerCap("minor"));
});

Deno.test("storyteller tier keeps merits and full power list", OPTS, () => {
  const mm = getArchetype("mastermind")!;
  const st = sheetFromArchetype(mm);
  assertEquals(st.npc.tier, "storyteller");
  assert(Object.keys(st.merits).length > 0);
  assert(st.npc.dreadPowers.length > 0);
});

Deno.test("derived stat helpers compute correctly", OPTS, () => {
  const sheet = sheetFromArchetype(getArchetype("thug")!);
  // Speed = Str + Dex + Size (3 + 2 + 5 = 10)
  assertEquals(sheetSpeed(sheet), 10);
  // Init = Dex + Composure (2 + 2 = 4)
  assertEquals(sheetInitiative(sheet), 4);
  // Health = Stamina + Size (3 + 5 = 8)
  assertEquals(sheetHealthMax(sheet), 8);
  // Defense = min(Dex 2, Wits 2) + Athletics 0 = 2
  assertEquals(sheetDefense(sheet), 2);
});

Deno.test("dread power catalog loads expected entries", OPTS, () => {
  const all = listDreadPowers();
  assert(all.length >= 10, "expected at least 10 dread powers");
  assertExists(getDreadPower("telekinesis"));
  assertExists(getDreadPower("mortal-mask"));
  assertExists(getDreadPower("possession"));
  assertEquals(getDreadPower("nonesuch"), null);
});

Deno.test("dread power tier gating", OPTS, () => {
  const pos = getDreadPower("possession")!;
  assertEquals(pos.tierMin, "major");
  assert(!tierMeetsPower("minor", pos));
  assert(tierMeetsPower("major", pos));
  assert(tierMeetsPower("storyteller", pos));

  const mm = getDreadPower("mortal-mask")!;
  assert(tierMeetsPower("minor", mm));
});
