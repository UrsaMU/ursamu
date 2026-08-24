/**
 * Tests — Environmental Hazard Calculations
 */
import { assertEquals, assertGreaterOrEqual, assertLessOrEqual } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  fallDiceCount,
  rollFallDamage,
  fireDamage,
  rollElectrocutionDamage,
} from "../commands/environment.ts";

describe("fallDiceCount()", () => {
  it("1m → 1d6 (minimum 1 die)", () => {
    assertEquals(fallDiceCount(1), 1);
  });

  it("2m → 1d6", () => {
    assertEquals(fallDiceCount(2), 1);
  });

  it("3m → 2d6 (ceil(3/2)=2)", () => {
    assertEquals(fallDiceCount(3), 2);
  });

  it("4m → 2d6 (ceil(4/2)=2)", () => {
    assertEquals(fallDiceCount(4), 2);
  });

  it("5m → 3d6 (ceil(5/2)=3)", () => {
    assertEquals(fallDiceCount(5), 3);
  });

  it("10m → 5d6 (ceil(10/2)=5)", () => {
    assertEquals(fallDiceCount(10), 5);
  });
});

describe("rollFallDamage() — range checks", () => {
  it("4m → 2d6: result in [2, 12]", () => {
    for (let i = 0; i < 100; i++) {
      const dmg = rollFallDamage(4);
      assertGreaterOrEqual(dmg, 2);
      assertLessOrEqual(dmg, 12);
    }
  });

  it("10m → 5d6: result in [5, 30]", () => {
    for (let i = 0; i < 100; i++) {
      const dmg = rollFallDamage(10);
      assertGreaterOrEqual(dmg, 5);
      assertLessOrEqual(dmg, 30);
    }
  });

  it("1m → 1d6: result in [1, 6]", () => {
    for (let i = 0; i < 100; i++) {
      const dmg = rollFallDamage(1);
      assertGreaterOrEqual(dmg, 1);
      assertLessOrEqual(dmg, 6);
    }
  });
});

describe("fireDamage()", () => {
  it("always returns 3 HP (direct, bypasses SP)", () => {
    assertEquals(fireDamage(), 3);
  });
});

describe("rollElectrocutionDamage()", () => {
  it("light current: 1d6, result in [1, 6]", () => {
    for (let i = 0; i < 100; i++) {
      const dmg = rollElectrocutionDamage("light");
      assertGreaterOrEqual(dmg, 1);
      assertLessOrEqual(dmg, 6);
    }
  });

  it("heavy current: 2d6, result in [2, 12]", () => {
    for (let i = 0; i < 100; i++) {
      const dmg = rollElectrocutionDamage("heavy");
      assertGreaterOrEqual(dmg, 2);
      assertLessOrEqual(dmg, 12);
    }
  });
});
