/**
 * Tests — Humanity Regain Utilities (lib/humanity.ts)
 */
import { assertEquals, assertGreaterOrEqual, assertLessOrEqual } from "jsr:@std/assert@^1";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  HUMANITY_COOLDOWN_MS,
  HUMANITY_GAIN_TYPES,
  rollHumanityGain,
  isHumanityGainOnCooldown,
  humanityGainCooldownRemaining,
  type HumanityGainType,
} from "../engine/humanity.ts";

// ── Constants ─────────────────────────────────────────────────────────────────

describe("HUMANITY_COOLDOWN_MS", () => {
  it("is 24 hours in milliseconds", () => {
    assertEquals(HUMANITY_COOLDOWN_MS, 24 * 60 * 60 * 1_000);
  });
});

describe("HUMANITY_GAIN_TYPES", () => {
  it("contains all four types", () => {
    const types = [...HUMANITY_GAIN_TYPES];
    assertEquals(types.includes("connection"),  true);
    assertEquals(types.includes("achievement"), true);
    assertEquals(types.includes("kindness"),    true);
    assertEquals(types.includes("memory"),      true);
    assertEquals(types.length, 4);
  });
});

// ── rollHumanityGain ──────────────────────────────────────────────────────────

describe("rollHumanityGain()", () => {
  function runMany(type: HumanityGainType, count = 200) {
    return Array.from({ length: count }, () => rollHumanityGain(type));
  }

  it("connection: range 2–12 (2d6)", () => {
    const rolls = runMany("connection");
    assertGreaterOrEqual(Math.min(...rolls), 2);
    assertLessOrEqual(Math.max(...rolls), 12);
  });

  it("achievement: range 3–8 (1d6+2)", () => {
    const rolls = runMany("achievement");
    assertGreaterOrEqual(Math.min(...rolls), 3);
    assertLessOrEqual(Math.max(...rolls), 8);
  });

  it("kindness: range 1–6 (1d6)", () => {
    const rolls = runMany("kindness");
    assertGreaterOrEqual(Math.min(...rolls), 1);
    assertLessOrEqual(Math.max(...rolls), 6);
  });

  it("memory: range 1–3 (1d3)", () => {
    const rolls = runMany("memory");
    assertGreaterOrEqual(Math.min(...rolls), 1);
    assertLessOrEqual(Math.max(...rolls), 3);
  });

  it("all gain types return positive integers", () => {
    for (const type of HUMANITY_GAIN_TYPES) {
      const result = rollHumanityGain(type);
      assertGreaterOrEqual(result, 1);
      assertEquals(Number.isInteger(result), true);
    }
  });
});

// ── isHumanityGainOnCooldown ──────────────────────────────────────────────────

describe("isHumanityGainOnCooldown()", () => {
  it("returns false when lastGainedAt is null", () => {
    assertEquals(isHumanityGainOnCooldown(null), false);
  });

  it("returns false when lastGainedAt is undefined", () => {
    assertEquals(isHumanityGainOnCooldown(undefined), false);
  });

  it("returns true when last gain was recent", () => {
    const now = Date.now();
    assertEquals(isHumanityGainOnCooldown(now - 60_000, now), true);
  });

  it("returns true when last gain was exactly 1ms ago", () => {
    const now = Date.now();
    assertEquals(isHumanityGainOnCooldown(now - 1, now), true);
  });

  it("returns false when cooldown has expired", () => {
    const now = Date.now();
    assertEquals(isHumanityGainOnCooldown(now - HUMANITY_COOLDOWN_MS - 1, now), false);
  });

  it("returns false when last gain was exactly at cooldown boundary", () => {
    const now = Date.now();
    assertEquals(isHumanityGainOnCooldown(now - HUMANITY_COOLDOWN_MS, now), false);
  });
});

// ── humanityGainCooldownRemaining ─────────────────────────────────────────────

describe("humanityGainCooldownRemaining()", () => {
  it("returns a positive number when on cooldown", () => {
    const now = Date.now();
    const remaining = humanityGainCooldownRemaining(now - 60_000, now);
    assertGreaterOrEqual(remaining, 0);
    assertLessOrEqual(remaining, HUMANITY_COOLDOWN_MS);
  });

  it("returns 0 when cooldown has expired", () => {
    const now = Date.now();
    assertEquals(humanityGainCooldownRemaining(now - HUMANITY_COOLDOWN_MS - 1_000, now), 0);
  });

  it("remaining decreases over time", () => {
    const lastGained = Date.now() - 1_000;
    const rem1 = humanityGainCooldownRemaining(lastGained, Date.now());
    const rem2 = humanityGainCooldownRemaining(lastGained, Date.now() + 1_000);
    assertGreaterOrEqual(rem1, rem2);
  });
});
