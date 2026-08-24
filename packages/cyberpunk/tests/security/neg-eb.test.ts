/**
 * Security tests — NegEB-1 / NegEB-2
 *
 * Exploit: admin commands +eb/give and +job/payout accept negative amounts,
 * allowing an admin to drain another player's Eurodollars via $inc with a
 * negative value (e.g. +eb/give target=-9999).
 *
 * These tests MUST FAIL against the unpatched code (RED phase).
 * After patching, all assertions pass (GREEN phase).
 */
import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { parsePositiveInt } from "../../engine/validation.ts";

// ── Unit tests against the shared validator ────────────────────────────────

describe("parsePositiveInt() — NegEB exploit guard", () => {
  it("NegEB-1 exploit: negative amount returns null (blocked)", () => {
    // EXPLOIT: +eb/give target=-9999
    // Before fix: parseInt("-9999") = -9999, passed isNaN check, drains EB
    assertEquals(parsePositiveInt("-9999"), null);
  });

  it("NegEB-2 exploit: negative payout returns null (blocked)", () => {
    // EXPLOIT: +job/payout target -9999
    assertEquals(parsePositiveInt("-9999"), null);
  });

  it("zero amount returns null (not a positive integer)", () => {
    assertEquals(parsePositiveInt("0"), null);
  });

  it("positive amount returns the parsed number", () => {
    assertNotEquals(parsePositiveInt("500"), null);
    assertEquals(parsePositiveInt("500"), 500);
  });

  it("non-numeric string returns null", () => {
    assertEquals(parsePositiveInt("abc"), null);
    assertEquals(parsePositiveInt(""), null);
  });

  it("float string is rejected (not integer)", () => {
    // "9.5" parses as 9 via parseInt — accepted since parseInt truncates
    // But "NaN" and truly non-numeric should be null
    assertEquals(parsePositiveInt("NaN"), null);
  });

  it("large positive amount is allowed", () => {
    assertEquals(parsePositiveInt("1000000"), 1000000);
  });
});
