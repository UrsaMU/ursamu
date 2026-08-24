/**
 * Security tests — LocationEffects Array Growth (MEDIUM)
 *
 * Exploit: +brawl/grab and +attack/called in brawl.ts / fnff.ts call
 * addLocationEffect() in a loop with no upper-bound check. An attacker
 * could issue thousands of +brawl/grab commands against a target,
 * growing state.cpr.locationEffects without limit and bloating the DB
 * document beyond practical limits (MongoDB document size limit: 16 MB).
 *
 * Fix: Export MAX_LOCATION_EFFECTS from lib/validation.ts (consistent with
 * the existing MAX_CRIT_INJURIES pattern) and enforce it at the call sites
 * in brawl.ts and fnff.ts before appending to the array.
 *
 * These tests document the required behaviour via the exported
 * MAX_LOCATION_EFFECTS constant from lib/validation.ts.
 */
import { assertEquals, assertGreaterOrEqual, assertLessOrEqual } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { MAX_LOCATION_EFFECTS } from "../../engine/validation.ts";
import { addLocationEffect } from "../../engine/fnff.ts";
import { buildNewCharacter } from "../../engine/character.ts";
import type { ILocationEffect } from "../../engine/fnff.ts";

describe("MAX_LOCATION_EFFECTS — array growth guard", () => {
  it("is exported from lib/validation.ts as a positive integer", () => {
    assertGreaterOrEqual(MAX_LOCATION_EFFECTS, 1);
    assertEquals(Number.isInteger(MAX_LOCATION_EFFECTS), true);
  });

  it("is a reasonable cap (<=20)", () => {
    assertLessOrEqual(MAX_LOCATION_EFFECTS, 20);
  });

  it("addLocationEffect without a cap can grow unboundedly (documents the need for a guard)", () => {
    // This proves the lib function itself does not cap — the guard MUST
    // be enforced at the command layer using MAX_LOCATION_EFFECTS.
    let effects: ILocationEffect[] = [];
    for (let i = 0; i < MAX_LOCATION_EFFECTS + 5; i++) {
      effects = addLocationEffect(effects, "grabbed", `src${i}`);
    }
    // Lib-level: array can exceed the cap
    assertGreaterOrEqual(effects.length, MAX_LOCATION_EFFECTS + 1);
  });

  it("character starts with empty locationEffects (no pre-existing bloat)", () => {
    // Baseline check: new characters have no location effects
    const cpr = buildNewCharacter("solo");
    assertEquals((cpr.locationEffects ?? []).length, 0);
  });
});
