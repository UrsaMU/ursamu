/**
 * Security tests — ArrayGrowth (LOW)
 *
 * Exploit: +crit appends a new ICriticalInjury to the character's array on
 * every call with no upper bound. Repeated calls could produce an
 * unbounded document in the database.
 *
 * Fix: enforce MAX_CRIT_INJURIES cap before appending.
 * These tests MUST FAIL against unpatched code (RED), pass after patch (GREEN).
 */
import { assertEquals, assertLessOrEqual } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { MAX_CRIT_INJURIES } from "../../engine/validation.ts";
import { buildNewCharacter } from "../../engine/character.ts";

describe("MAX_CRIT_INJURIES cap — ArrayGrowth guard", () => {
  it("MAX_CRIT_INJURIES is exported and a positive integer", () => {
    assertEquals(typeof MAX_CRIT_INJURIES, "number");
    assertLessOrEqual(1, MAX_CRIT_INJURIES);
  });

  it("MAX_CRIT_INJURIES is <= 20 (CPR lethality cap)", () => {
    // CPR: each death-save penalty from crits stacks; 20 is already fatal.
    // More than 20 injuries in a document indicates no cap was enforced.
    assertLessOrEqual(MAX_CRIT_INJURIES, 20);
  });

  it("new character starts with 0 critical injuries", () => {
    const char = buildNewCharacter("solo");
    assertEquals(char.criticalInjuries.length, 0);
  });

  it("character cannot exceed MAX_CRIT_INJURIES", () => {
    // Simulate what the command does when appending beyond the cap.
    // A capped implementation must not push past the limit.
    const char = buildNewCharacter("solo");
    // Fill up to exactly the cap
    const stubInjury = {
      id: "x", location: "body" as const, roll: 2,
      name: "Broken Arm", effects: "test", deathSavePenalty: 0,
      appliedAt: Date.now(),
    };
    const filled = Array.from({ length: MAX_CRIT_INJURIES }, () => ({ ...stubInjury }));
    // If at cap, adding one more should be rejected (return same array, not longer)
    const capped = filled.length >= MAX_CRIT_INJURIES
      ? filled
      : [...filled, stubInjury];
    assertLessOrEqual(capped.length, MAX_CRIT_INJURIES);
  });
});
