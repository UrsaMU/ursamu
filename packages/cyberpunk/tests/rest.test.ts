/**
 * Tests — Wound Recovery Timer Utilities (lib/rest.ts)
 */
import { assertEquals, assertGreaterOrEqual, assertLessOrEqual } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  SHORT_REST_MS,
  LONG_REST_MS,
  msRemaining,
  isRestComplete,
  calcRestHeal,
  msToDisplay,
  type IRestTimer,
} from "../engine/rest.ts";
import { buildNewCharacter } from "../engine/character.ts";
import type { ICPRCharacter } from "../db/schemas.ts";

function makeChar(overrides: Partial<ICPRCharacter> = {}): ICPRCharacter {
  return { ...buildNewCharacter("solo"), ...overrides } as ICPRCharacter;
}

// ── msRemaining ───────────────────────────────────────────────────────────────

describe("msRemaining()", () => {
  it("returns positive value when rest not yet complete", () => {
    const timer: IRestTimer = { startedAt: Date.now() - 1_000, type: "short" };
    const rem = msRemaining(timer);
    assertGreaterOrEqual(rem, 0);
    assertLessOrEqual(rem, SHORT_REST_MS);
  });

  it("returns negative value when rest is overdue", () => {
    const timer: IRestTimer = { startedAt: Date.now() - SHORT_REST_MS - 1_000, type: "short" };
    const rem = msRemaining(timer);
    assertLessOrEqual(rem, 0);
  });

  it("long rest has correct duration constant", () => {
    assertEquals(LONG_REST_MS, 24 * 60 * 60 * 1_000);
  });

  it("short rest has correct duration constant", () => {
    assertEquals(SHORT_REST_MS, 8 * 60 * 60 * 1_000);
  });
});

// ── isRestComplete ────────────────────────────────────────────────────────────

describe("isRestComplete()", () => {
  it("returns false for a just-started rest", () => {
    const timer: IRestTimer = { startedAt: Date.now(), type: "short" };
    assertEquals(isRestComplete(timer), false);
  });

  it("returns true when short rest period has elapsed", () => {
    const timer: IRestTimer = { startedAt: Date.now() - SHORT_REST_MS - 1, type: "short" };
    assertEquals(isRestComplete(timer), true);
  });

  it("returns true when long rest period has elapsed", () => {
    const timer: IRestTimer = { startedAt: Date.now() - LONG_REST_MS - 1, type: "long" };
    assertEquals(isRestComplete(timer), true);
  });

  it("returns false when long rest is still in progress", () => {
    const timer: IRestTimer = { startedAt: Date.now() - SHORT_REST_MS, type: "long" };
    assertEquals(isRestComplete(timer), false);
  });
});

// ── calcRestHeal ──────────────────────────────────────────────────────────────

describe("calcRestHeal()", () => {
  it("long rest restores full HP", () => {
    const cpr = makeChar();
    cpr.hp.max     = 30;
    cpr.hp.current = 10;
    const { amount, newHp } = calcRestHeal("long", cpr);
    assertEquals(amount, 20);
    assertEquals(newHp, 30);
  });

  it("long rest on full HP returns amount 0 and leaves HP unchanged", () => {
    const cpr = makeChar();
    cpr.hp.max     = 30;
    cpr.hp.current = 30;
    const { amount, newHp } = calcRestHeal("long", cpr);
    assertEquals(amount, 0);
    assertEquals(newHp, 30);
  });

  it("short rest heals 2d6 (range 2–12)", () => {
    const cpr = makeChar();
    cpr.hp.max     = 30;
    cpr.hp.current = 5;
    const { amount } = calcRestHeal("short", cpr);
    assertGreaterOrEqual(amount, 2);
    assertLessOrEqual(amount, 12);
  });

  it("short rest does not exceed max HP", () => {
    const cpr = makeChar();
    cpr.hp.max     = 30;
    cpr.hp.current = 28; // only 2 missing — even minimum roll caps at max
    const { newHp } = calcRestHeal("short", cpr);
    assertLessOrEqual(newHp, cpr.hp.max);
  });

  it("newWoundState reflects healed HP", () => {
    const cpr = makeChar();
    cpr.hp.max     = 30;
    cpr.hp.current = 30;
    const { newWoundState } = calcRestHeal("long", cpr);
    assertEquals(newWoundState, "healthy");
  });
});

// ── msToDisplay ───────────────────────────────────────────────────────────────

describe("msToDisplay()", () => {
  it("zero or negative returns '0m'", () => {
    assertEquals(msToDisplay(0), "0m");
    assertEquals(msToDisplay(-1000), "0m");
  });

  it("less than one hour shows minutes only", () => {
    assertEquals(msToDisplay(45 * 60 * 1_000), "45m");
  });

  it("exactly one hour", () => {
    assertEquals(msToDisplay(60 * 60 * 1_000), "1h 0m");
  });

  it("hours and minutes combined", () => {
    assertEquals(msToDisplay(7 * 3_600_000 + 23 * 60_000), "7h 23m");
  });
});
