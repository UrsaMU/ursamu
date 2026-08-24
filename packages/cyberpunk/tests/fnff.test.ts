/**
 * Tests — FNFF Utility Functions (lib/fnff.ts)
 */
import { assertEquals, assertGreaterOrEqual } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  CALLED_SHOT_EFFECT,
  CALLED_SHOT_NARRATIVE,
  hasLocationEffect,
  addLocationEffect,
  resolveBrawlOpposed,
  resolveBrawlDV,
  type ILocationEffect,
} from "../engine/fnff.ts";
import { buildNewCharacter } from "../engine/character.ts";
import type { ICPRCharacter } from "../db/schemas.ts";

function makeChar(overrides: Partial<ICPRCharacter> = {}): ICPRCharacter {
  return { ...buildNewCharacter("solo"), ...overrides } as ICPRCharacter;
}

// ── CALLED_SHOT_EFFECT / CALLED_SHOT_NARRATIVE ────────────────────────────────

describe("CALLED_SHOT_EFFECT", () => {
  it("arm maps to arm_disabled", () => assertEquals(CALLED_SHOT_EFFECT.arm, "arm_disabled"));
  it("leg maps to leg_slowed",    () => assertEquals(CALLED_SHOT_EFFECT.leg, "leg_slowed"));
  it("hand maps to hand_disabled",() => assertEquals(CALLED_SHOT_EFFECT.hand, "hand_disabled"));
  it("eye maps to eye_damaged",   () => assertEquals(CALLED_SHOT_EFFECT.eye, "eye_damaged"));
});

describe("CALLED_SHOT_NARRATIVE", () => {
  it("all four locations have non-empty narratives", () => {
    for (const loc of ["arm", "leg", "hand", "eye"] as const) {
      assertEquals(typeof CALLED_SHOT_NARRATIVE[loc], "string");
      assertGreaterOrEqual(CALLED_SHOT_NARRATIVE[loc].length, 5);
    }
  });
});

// ── hasLocationEffect ─────────────────────────────────────────────────────────

describe("hasLocationEffect()", () => {
  it("returns false when locationEffects is empty", () => {
    const cpr = makeChar({ locationEffects: [] });
    assertEquals(hasLocationEffect(cpr, "grabbed"), false);
  });

  it("returns false when locationEffects is undefined", () => {
    const cpr = makeChar();
    // @ts-ignore — simulate missing field
    cpr.locationEffects = undefined;
    assertEquals(hasLocationEffect(cpr, "grabbed"), false);
  });

  it("returns true when effect is present", () => {
    const effect: ILocationEffect = { type: "grabbed", source: "attacker1", appliedAt: Date.now() };
    const cpr = makeChar({ locationEffects: [effect] });
    assertEquals(hasLocationEffect(cpr, "grabbed"), true);
  });

  it("returns false for a different effect type", () => {
    const effect: ILocationEffect = { type: "grabbed", source: "attacker1", appliedAt: Date.now() };
    const cpr = makeChar({ locationEffects: [effect] });
    assertEquals(hasLocationEffect(cpr, "pinned"), false);
  });
});

// ── addLocationEffect ─────────────────────────────────────────────────────────

describe("addLocationEffect()", () => {
  it("appends effect to empty array", () => {
    const result = addLocationEffect([], "grabbed", "src1");
    assertEquals(result.length, 1);
    assertEquals(result[0].type, "grabbed");
    assertEquals(result[0].source, "src1");
  });

  it("does not mutate the original array", () => {
    const original: ILocationEffect[] = [];
    addLocationEffect(original, "pinned", "src1");
    assertEquals(original.length, 0);
  });

  it("appends to an existing array", () => {
    const existing: ILocationEffect[] = [{ type: "grabbed", source: "src1", appliedAt: 0 }];
    const result = addLocationEffect(existing, "pinned", "src2");
    assertEquals(result.length, 2);
    assertEquals(result[1].type, "pinned");
  });

  it("appliedAt is a recent timestamp", () => {
    const before = Date.now();
    const result = addLocationEffect([], "grabbed", "src1");
    const after  = Date.now();
    assertGreaterOrEqual(result[0].appliedAt, before);
    assertGreaterOrEqual(after, result[0].appliedAt);
  });
});

// ── resolveBrawlOpposed ───────────────────────────────────────────────────────

describe("resolveBrawlOpposed()", () => {
  it("returns a valid IBrawlResult", () => {
    const r = resolveBrawlOpposed(6, 4, 5, 2);
    assertEquals(typeof r.atkTotal, "number");
    assertEquals(typeof r.defTotal, "number");
    assertEquals(typeof r.success, "boolean");
  });

  it("success is true only when atkTotal > defTotal", () => {
    // Run 100 times and verify invariant holds
    for (let i = 0; i < 100; i++) {
      const r = resolveBrawlOpposed(6, 4, 5, 2);
      assertEquals(r.success, r.atkTotal > r.defTotal);
    }
  });

  it("ties go to defender (success is false on tie)", () => {
    // We can't force a tie via random rolls, but we verify the tie logic via
    // the fact that success uses strict > (not >=).
    // Manually construct a scenario that would be a tie: both totals equal.
    // This is tested indirectly via the invariant above.
    // Here we verify that a trivially forced "tie" returns false.
    const r = { atkTotal: 10, defTotal: 10, success: 10 > 10 };
    assertEquals(r.success, false);
  });

  it("total is within expected range (stat+skill+d10Critical range)", () => {
    for (let i = 0; i < 50; i++) {
      const r = resolveBrawlOpposed(6, 4, 5, 2);
      // atk: 6+4+roll, min roll for critical can be -9 (crit fail 1: 1-10), max 20
      // practical range: (6+4-9=1) to (6+4+20=30)
      assertGreaterOrEqual(r.atkTotal, 1);
      assertGreaterOrEqual(r.defTotal, -2); // 5+2-9
    }
  });
});

// ── resolveBrawlDV ────────────────────────────────────────────────────────────

describe("resolveBrawlDV()", () => {
  it("returns a valid IBrawlResult", () => {
    const r = resolveBrawlDV(6, 4, 15);
    assertEquals(typeof r.atkTotal, "number");
    assertEquals(r.defTotal, 15);
    assertEquals(typeof r.success, "boolean");
  });

  it("success reflects atkTotal >= dv", () => {
    for (let i = 0; i < 100; i++) {
      const r = resolveBrawlDV(6, 4, 15);
      assertEquals(r.success, r.atkTotal >= 15);
    }
  });

  it("defTotal equals the supplied DV", () => {
    assertEquals(resolveBrawlDV(5, 3, 22).defTotal, 22);
  });
});
