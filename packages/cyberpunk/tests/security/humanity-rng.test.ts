/**
 * Security tests — Humanity RNG Bias (LOW)
 *
 * Exploit: lib/humanity.ts uses Math.ceil(Math.random() * 3) for the
 * "memory" gain type. Math.ceil(0) = 0, which means if Math.random()
 * returns exactly 0.0 (a valid return value per the spec), the result
 * is 0 — an invalid HL gain value. Additionally, the canonical idiom
 * for a uniform 1d3 is Math.floor(Math.random() * 3) + 1, which makes
 * the intent explicit and avoids the zero edge case entirely.
 *
 * Fix: Replace Math.ceil(Math.random() * 3) with
 *      Math.floor(Math.random() * 3) + 1 in lib/humanity.ts.
 *
 * These tests verify the invariant: rollHumanityGain("memory") always
 * returns a value in the range [1, 3].
 */
import { assertEquals, assertGreaterOrEqual, assertLessOrEqual } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { rollHumanityGain } from "../../engine/humanity.ts";

describe("rollHumanityGain('memory') — RNG bias guard", () => {
  it("never returns 0 (invalid HL gain)", () => {
    // Run 500 times to surface the edge case
    for (let i = 0; i < 500; i++) {
      const result = rollHumanityGain("memory");
      assertGreaterOrEqual(result, 1, `Expected >= 1, got ${result} on iteration ${i}`);
    }
  });

  it("returns values only in [1, 3]", () => {
    for (let i = 0; i < 500; i++) {
      const result = rollHumanityGain("memory");
      assertGreaterOrEqual(result, 1);
      assertLessOrEqual(result, 3);
    }
  });

  it("returns an integer", () => {
    for (let i = 0; i < 50; i++) {
      const result = rollHumanityGain("memory");
      assertEquals(Number.isInteger(result), true);
    }
  });
});
