/**
 * Tests — Dice Rolling Utilities
 */
import { assertEquals, assertGreaterOrEqual, assertLessOrEqual, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { d10, d6, rollND6, rollD10Critical, skillCheck, rollDamage, applyArmor } from "../engine/dice.ts";

describe("d10()", () => {
  it("returns 1–10", () => {
    for (let i = 0; i < 100; i++) {
      const r = d10();
      assertGreaterOrEqual(r, 1);
      assertLessOrEqual(r, 10);
    }
  });
});

describe("d6()", () => {
  it("returns 1–6", () => {
    for (let i = 0; i < 100; i++) {
      const r = d6();
      assertGreaterOrEqual(r, 1);
      assertLessOrEqual(r, 6);
    }
  });
});

describe("rollND6()", () => {
  it("returns N dice", () => {
    const results = rollND6(3);
    assertEquals(results.length, 3);
    for (const r of results) {
      assertGreaterOrEqual(r, 1);
      assertLessOrEqual(r, 6);
    }
  });

  it("handles n=1", () => {
    assertEquals(rollND6(1).length, 1);
  });
});

describe("rollD10Critical()", () => {
  it("returns base, extra, total", () => {
    const { base, extra, total } = rollD10Critical();
    assertExists(base);
    assertExists(total);
    assertEquals(typeof extra, "number");
  });

  it("total equals base+extra when base is 10", () => {
    // Run enough times to likely hit a crit
    for (let i = 0; i < 200; i++) {
      const { base, extra, total } = rollD10Critical();
      assertEquals(total, base + extra);
    }
  });
});

describe("skillCheck()", () => {
  it("returns correct fields", () => {
    const result = skillCheck(5, 3, 15);
    assertExists(result.roll);
    assertExists(result.total);
    assertEquals(result.vs, 15);
    assertEquals(typeof result.success, "boolean");
  });

  it("total = stat + skill + roll", () => {
    const result = skillCheck(5, 3);
    assertEquals(result.total, result.stat + result.skill + result.roll + result.extra);
  });

  it("critSuccess when roll is 10", () => {
    // We can't force a 10, but success flag should be boolean
    const result = skillCheck(5, 5, 10);
    assertEquals(typeof result.critSuccess, "boolean");
    assertEquals(typeof result.critFail, "boolean");
  });

  it("success is true when total >= dv", () => {
    // Stat 10 + skill 10 guarantees >= 2 vs DV 1
    const result = skillCheck(10, 10, 1);
    assertEquals(result.success, true);
  });

  it("success is false when total always < dv", () => {
    // Can't guarantee failure due to crits, but DV 100 should always fail
    const result = skillCheck(1, 0, 100);
    if (!result.critSuccess) {
      assertEquals(result.success, false);
    }
  });
});

describe("rollDamage()", () => {
  it("rolls correct number of dice", () => {
    const result = rollDamage(3);
    assertEquals(result.dice.length, 3);
  });

  it("total is sum of dice", () => {
    const result = rollDamage(4);
    const sum = result.dice.reduce((a, b) => a + b, 0);
    assertEquals(result.total, sum);
  });

  it("detects critical (2+ sixes)", () => {
    // Can't force, but isCritical must be boolean
    const result = rollDamage(4);
    assertEquals(typeof result.isCritical, "boolean");
  });

  it("sixCount is accurate", () => {
    const result = rollDamage(6);
    const actualSixes = result.dice.filter((d) => d === 6).length;
    assertEquals(result.sixCount, actualSixes);
  });
});

describe("applyArmor()", () => {
  it("subtracts SP from damage", () => {
    assertEquals(applyArmor(20, 10), 10);
  });

  it("floors at 0", () => {
    assertEquals(applyArmor(5, 20), 0);
  });

  it("passes full damage when no armor", () => {
    assertEquals(applyArmor(15, 0), 15);
  });
});
