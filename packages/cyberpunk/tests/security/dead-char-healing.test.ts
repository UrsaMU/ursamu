/**
 * Security tests — Dead Character Healing (HIGH)
 *
 * Exploit: +pack/request medical in commands/pack.ts applies applyHealingToChar()
 * without checking woundState. A dead character (woundState: "dead", hp: 0)
 * receives positive HP and transitions out of "dead", effectively resurrecting
 * without any in-game mechanic or staff involvement.
 *
 * Fix: Add canReceiveHealing() guard to lib/validation.ts and call it in
 * handleRequest() before applying medical healing.
 *
 * These tests document the required behaviour via the exported
 * canReceiveHealing() helper from lib/validation.ts.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { canReceiveHealing } from "../../engine/validation.ts";
import { applyHealingToChar, buildNewCharacter } from "../../engine/character.ts";

describe("canReceiveHealing() — dead character guard", () => {
  it("returns false for a dead character", () => {
    const cpr = buildNewCharacter("solo");
    cpr.woundState = "dead";
    assertEquals(canReceiveHealing(cpr), false);
  });

  it("returns true for a healthy character", () => {
    const cpr = buildNewCharacter("solo");
    cpr.woundState = "healthy";
    assertEquals(canReceiveHealing(cpr), true);
  });

  it("returns true for a mortally wounded character (can be healed)", () => {
    const cpr = buildNewCharacter("solo");
    cpr.woundState = "mortally";
    assertEquals(canReceiveHealing(cpr), true);
  });

  it("returns true for seriously wounded (can be healed)", () => {
    const cpr = buildNewCharacter("solo");
    cpr.woundState = "seriously";
    assertEquals(canReceiveHealing(cpr), true);
  });
});

describe("applyHealingToChar() — lib-level proof of vulnerability", () => {
  it("heals a dead character without guard (proves guard must be at command layer)", () => {
    // This test documents WHY canReceiveHealing() must be checked BEFORE
    // calling applyHealingToChar(). The lib function is intentionally dumb
    // (pure math); the guard lives in the command.
    const cpr = buildNewCharacter("solo");
    cpr.woundState = "dead";
    cpr.hp.current = 0;
    cpr.hp.max = 30;
    const { newHp } = applyHealingToChar(cpr, 10);
    // Confirmed: lib-level healing works regardless of woundState.
    // Therefore the command MUST gate on canReceiveHealing() first.
    assertEquals(newHp, 10);
  });
});
