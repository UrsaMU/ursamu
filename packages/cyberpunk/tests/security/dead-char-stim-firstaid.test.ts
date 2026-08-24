/**
 * Security tests — Dead-Char Stim & FirstAid (HIGH)
 *
 * Exploit: +stim, +firstaid, and +heal call applyHealingToChar() without first
 * calling canReceiveHealing(). A dead character (woundState: "dead", HP 0)
 * can be healed, effectively resurrecting them without any staff intervention
 * or in-fiction mechanic. +stim also performs a global target search, meaning
 * a player in Room A can stim a dead character in Room B.
 *
 * Fix: Add canReceiveHealing() guard at the command layer (before calling
 * applyHealingToChar()) in +stim, +firstaid, and +heal.
 *
 * RED tests are those that prove the exploit exists without the guard.
 * GREEN tests verify the guard contract in engine/validation.ts.
 *
 * Because commands/wounds.ts imports the UrsaMU SDK (cannot import in Deno
 * test context), we model the exploit pattern using the same pure-function
 * guard that MUST be present in each command exec path.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { canReceiveHealing } from "../../engine/validation.ts";
import { applyHealingToChar, buildNewCharacter } from "../../engine/character.ts";

// ── Prove the exploit in isolated function model ───────────────────────────

/**
 * Simulates the UNPATCHED +stim exec path — no canReceiveHealing guard.
 * Returns the HP that the dead character would end up with.
 */
function stimExecUnpatched(targetWoundState: string, currentHp: number, maxHp: number): number | "BLOCKED" {
  // No canReceiveHealing() check — straight to applyHealingToChar
  const cpr = buildNewCharacter("solo");
  cpr.woundState = targetWoundState as "dead";
  cpr.hp = { current: currentHp, max: maxHp };
  cpr.swThreshold = Math.ceil(maxHp / 2);
  const { newHp } = applyHealingToChar(cpr, 10);
  return newHp; // Exploit: dead char gets HP back
}

/**
 * Simulates the PATCHED +stim exec path — canReceiveHealing guard present.
 */
function stimExecPatched(targetWoundState: string, currentHp: number, maxHp: number): number | "BLOCKED" {
  const cpr = buildNewCharacter("solo");
  cpr.woundState = targetWoundState as "dead";
  cpr.hp = { current: currentHp, max: maxHp };
  cpr.swThreshold = Math.ceil(maxHp / 2);
  if (!canReceiveHealing(cpr)) return "BLOCKED"; // guard present
  const { newHp } = applyHealingToChar(cpr, 10);
  return newHp;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Dead-char stim exploit — unpatched vs patched model", () => {
  it("DCH-1 (RED): unpatched stim heals dead character to 10 HP (exploit confirmed)", () => {
    const result = stimExecUnpatched("dead", 0, 30);
    // Exploit: dead character is resurrected to 10 HP without any guard
    assertEquals(result, 10, "EXPLOIT: dead char brought to 10 HP by unpatched stim");
  });

  it("DCH-2 (GREEN): patched stim blocks dead character", () => {
    const result = stimExecPatched("dead", 0, 30);
    assertEquals(result, "BLOCKED", "FIXED: dead char blocked by canReceiveHealing guard");
  });

  it("DCH-3 (GREEN): patched stim heals seriously wounded character normally", () => {
    const result = stimExecPatched("seriously", 10, 30);
    assertEquals(result, 20, "Seriously wounded char receives stim normally");
  });

  it("DCH-4 (GREEN): patched stim heals mortally wounded character normally", () => {
    const result = stimExecPatched("mortally", 0, 30);
    assertEquals(result, 10, "Mortally wounded char can receive stim");
  });
});

describe("canReceiveHealing() contract — guard must be checked before applyHealingToChar", () => {
  it("DCH-5: dead character returns false (must block all healing commands)", () => {
    const cpr = buildNewCharacter("solo");
    cpr.woundState = "dead";
    assertEquals(canReceiveHealing(cpr), false);
  });

  it("DCH-6: healthy character returns true", () => {
    const cpr = buildNewCharacter("solo");
    cpr.woundState = "healthy";
    assertEquals(canReceiveHealing(cpr), true);
  });

  it("DCH-7: mortally wounded returns true (can be healed/stabilized)", () => {
    const cpr = buildNewCharacter("solo");
    cpr.woundState = "mortally";
    assertEquals(canReceiveHealing(cpr), true);
  });

  it("DCH-8: seriously wounded returns true", () => {
    const cpr = buildNewCharacter("solo");
    cpr.woundState = "seriously";
    assertEquals(canReceiveHealing(cpr), true);
  });
});

describe("Dead-char heal exploit — +heal command model", () => {
  it("DCH-Heal-1 (RED): unpatched +heal applies HP to dead character", () => {
    const cpr = buildNewCharacter("solo");
    cpr.woundState = "dead";
    cpr.hp.current = 0;
    // No guard in unpatched path:
    const { newHp } = applyHealingToChar(cpr, 5);
    assertEquals(newHp, 5, "EXPLOIT: +heal would bring dead char to 5 HP");
  });

  it("DCH-Heal-2 (GREEN): patched +heal blocks dead character", () => {
    const cpr = buildNewCharacter("solo");
    cpr.woundState = "dead";
    const blocked = !canReceiveHealing(cpr);
    assertEquals(blocked, true, "FIXED: canReceiveHealing returns false for dead char");
  });
});

describe("Dead-char firstaid exploit — +firstaid command model", () => {
  it("DCH-FA-1 (RED): unpatched +firstaid would heal dead character", () => {
    const cpr = buildNewCharacter("solo");
    cpr.woundState = "dead";
    cpr.hp.current = 0;
    cpr.hp.max = 30;
    const heal = 4; // simulated 1d6 result
    const { newHp } = applyHealingToChar(cpr, heal);
    assertEquals(newHp, 4, "EXPLOIT: +firstaid would bring dead char to 4 HP");
  });

  it("DCH-FA-2 (GREEN): patched +firstaid blocks dead character", () => {
    const cpr = buildNewCharacter("solo");
    cpr.woundState = "dead";
    assertEquals(canReceiveHealing(cpr), false, "FIXED: dead char blocked");
  });
});
