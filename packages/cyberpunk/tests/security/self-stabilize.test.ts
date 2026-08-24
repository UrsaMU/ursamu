/**
 * Security tests — SelfStabilize (LOW)
 *
 * Exploit: +stabilize resolves the target via u.util.target which can return
 * the caller themselves, letting a mortally wounded character auto-stabilize
 * without a real healer. CPR core rules explicitly forbid self-administered
 * First Aid while mortally wounded.
 *
 * Fix: if target.id === u.me.id, reject with an error message.
 *
 * These tests document the required behaviour; we verify via the exported
 * canSelfStabilize() helper from lib/validation.ts.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { canSelfStabilize } from "../../engine/validation.ts";

describe("canSelfStabilize() — SelfStabilize guard", () => {
  it("returns false when caller and target IDs are equal (same player)", () => {
    // EXPLOIT: +stabilize <self> while mortally wounded
    assertEquals(canSelfStabilize("player1", "player1"), false);
  });

  it("returns true when caller and target are different players", () => {
    assertEquals(canSelfStabilize("player1", "player2"), true);
  });

  it("returns false for empty/undefined IDs (edge case safety)", () => {
    assertEquals(canSelfStabilize("", ""), false);
  });
});
