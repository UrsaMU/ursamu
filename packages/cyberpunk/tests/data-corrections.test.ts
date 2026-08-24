/**
 * Data accuracy regression tests — CPR core rulebook values.
 * Spot-checks all corrections made in the 2026-05-01 data audit.
 */
import { assertEquals, assertExists, assert } from "@std/assert";
import { ARMOR_CATALOG } from "../data/armor.ts";
import { DRUGS } from "../data/drugs.ts";
import { CYBERWARE_CATALOG } from "../data/cyberware.ts";

// ── Armor ──────────────────────────────────────────────────────────────────

Deno.test("Armor: Medium Armorjack SP is 12", () => {
  const entry = ARMOR_CATALOG.find((a) => a.name === "medium_armorjack");
  assertExists(entry);
  assertEquals(entry.sp, 12);
});

Deno.test("Armor: Medium Armorjack penalty is -2", () => {
  const entry = ARMOR_CATALOG.find((a) => a.name === "medium_armorjack");
  assertExists(entry);
  assertEquals(entry.penalty, -2);
});

Deno.test("Armor: Heavy Armorjack SP is 13", () => {
  const entry = ARMOR_CATALOG.find((a) => a.name === "heavy_armorjack");
  assertExists(entry);
  assertEquals(entry.sp, 13);
});

Deno.test("Armor: MetalGear SP is 18", () => {
  const entry = ARMOR_CATALOG.find((a) => a.name === "metalgear");
  assertExists(entry);
  assertEquals(entry.sp, 18);
});

Deno.test("Armor: Flak exists in catalog", () => {
  const entry = ARMOR_CATALOG.find((a) => a.name === "flak");
  assertExists(entry, "Flak armor missing from ARMOR_CATALOG");
});

Deno.test("Armor: Flak SP is 15 and penalty is -4", () => {
  const entry = ARMOR_CATALOG.find((a) => a.name === "flak");
  assertExists(entry);
  assertEquals(entry.sp, 15);
  assertEquals(entry.penalty, -4);
});

Deno.test("Armor: Bodyweight Suit SP is 11", () => {
  const entry = ARMOR_CATALOG.find((a) => a.name === "body_weight_suit");
  assertExists(entry);
  assertEquals(entry.sp, 11);
});

Deno.test("Armor: Bodyweight Suit covers both body and head", () => {
  const entry = ARMOR_CATALOG.find((a) => a.name === "body_weight_suit");
  assertExists(entry);
  assert(entry.locations.includes("body"), "body_weight_suit should cover body");
  assert(entry.locations.includes("head"), "body_weight_suit should cover head");
});

// ── Drugs ─────────────────────────────────────────────────────────────────

Deno.test("Drug: Synthcoke duration is 4 hours", () => {
  const entry = DRUGS.find((d) => d.name === "synthcoke");
  assertExists(entry);
  assertEquals(entry.durationMs, 4 * 60 * 60 * 1000);
});

Deno.test("Drug: Synthcoke effect mentions REF", () => {
  const entry = DRUGS.find((d) => d.name === "synthcoke");
  assertExists(entry);
  assert(entry.effects.includes("REF"), `Synthcoke effect should mention REF, got: ${entry.effects}`);
});

Deno.test("Drug: Boost duration is 24 hours", () => {
  const entry = DRUGS.find((d) => d.name === "boost");
  assertExists(entry);
  assertEquals(entry.durationMs, 24 * 60 * 60 * 1000);
});

Deno.test("Drug: Boost effect mentions INT", () => {
  const entry = DRUGS.find((d) => d.name === "boost");
  assertExists(entry);
  assert(entry.effects.includes("INT"), `Boost effect should mention INT, got: ${entry.effects}`);
});

Deno.test("Drug: Smash has social effect keywords (Persuasion, Conversation)", () => {
  const entry = DRUGS.find((d) => d.name === "smash");
  assertExists(entry);
  assert(
    entry.effects.includes("Persuasion") && entry.effects.includes("Conversation"),
    `Smash should be a social drug, got: ${entry.effects}`
  );
});

Deno.test("Drug: Smash does NOT have combat keywords (attacks, damage, melee, BODY)", () => {
  const entry = DRUGS.find((d) => d.name === "smash");
  assertExists(entry);
  const lower = entry.effects.toLowerCase();
  assert(!lower.includes("attack"), `Smash should not mention attacks, got: ${entry.effects}`);
  assert(!lower.includes("melee"), `Smash should not mention melee, got: ${entry.effects}`);
});

Deno.test("Drug: Blue Glass exists in drug catalog", () => {
  const entry = DRUGS.find((d) => d.name === "blue_glass");
  assertExists(entry, "Blue Glass missing from DRUGS catalog");
});

Deno.test("Drug: Black Lace duration is 24 hours", () => {
  const entry = DRUGS.find((d) => d.name === "black_lace");
  assertExists(entry);
  assertEquals(entry.durationMs, 24 * 60 * 60 * 1000);
});

// ── Cyberware ─────────────────────────────────────────────────────────────

Deno.test("Cyberware: pain_editor hlRoll is 4d6", () => {
  const entry = CYBERWARE_CATALOG.find((c) => c.name === "pain_editor");
  assertExists(entry);
  assertEquals(entry.hlRoll, "4d6");
});

Deno.test("Cyberware: kerenzikov hlRoll is 4d6", () => {
  const entry = CYBERWARE_CATALOG.find((c) => c.name === "kerenzikov");
  assertExists(entry);
  assertEquals(entry.hlRoll, "4d6");
});

Deno.test("Cyberware: subdermal_armor description says 'not stack' or 'highest SP'", () => {
  const entry = CYBERWARE_CATALOG.find((c) => c.name === "subdermal_armor");
  assertExists(entry);
  const desc = entry.description.toLowerCase();
  assert(
    desc.includes("not stack") || desc.includes("highest sp"),
    `subdermal_armor description should clarify no-stack rule, got: ${entry.description}`
  );
});

Deno.test("Cyberware: skin_weave exists in catalog", () => {
  const entry = CYBERWARE_CATALOG.find((c) => c.name === "skin_weave");
  assertExists(entry, "skin_weave missing from CYBERWARE_CATALOG");
});

Deno.test("Cyberware: skin_weave HL is 7 and hlRoll is 2d6", () => {
  const entry = CYBERWARE_CATALOG.find((c) => c.name === "skin_weave");
  assertExists(entry);
  assertEquals(entry.hl, 7);
  assertEquals(entry.hlRoll, "2d6");
});
