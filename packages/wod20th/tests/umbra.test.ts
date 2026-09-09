// tests/umbra.test.ts -- Unit tests for the Step Sideways mechanic.
//
// We inject a deterministic roller into stepSideways so the dice outcomes
// are not subject to Math.random. The pure function must never mutate the
// input character.
import { assert, assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import { stepSideways, isInUmbra, DEFAULT_GAUNTLET } from "../core/umbra.ts";
import { evaluateRoll } from "../core/dice.ts";
import type { IWoDChar } from "../core/types.ts";

function mkChar(overrides: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "c1",
    playerId: "p1",
    splat: "wta",
    status: "approved",
    chargenStep: 6,
    concept: "test",
    attributePriority: ["", "", ""],
    attributes: {},
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {},
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 6,
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: 0,
    updatedAt: 0,
    rage: 3,
    gnosis: 5,
    ...overrides,
  };
}

/** Build a deterministic roller that returns a fixed dice set. */
function fixedRoller(dice: number[]) {
  return (_pool: number, difficulty: number) =>
    evaluateRoll(dice, difficulty, false);
}

describe("stepSideways", () => {
  it("returns 'entered' when not in Umbra and net successes >= 1", () => {
    const char = mkChar({ inUmbra: false });
    const r = stepSideways(char, DEFAULT_GAUNTLET, fixedRoller([8, 9, 4]));
    assertEquals(r.outcome, "entered");
    assert(r.ok);
    assert(r.roll.netSuccesses >= 1);
  });

  it("returns 'exited' when already in Umbra and net successes >= 1", () => {
    const char = mkChar({ inUmbra: true });
    const r = stepSideways(char, DEFAULT_GAUNTLET, fixedRoller([7, 10]));
    assertEquals(r.outcome, "exited");
    assert(r.ok);
  });

  it("returns 'failed' on zero net successes (no ones)", () => {
    const char = mkChar({ inUmbra: false });
    const r = stepSideways(char, DEFAULT_GAUNTLET, fixedRoller([2, 3, 4, 5]));
    assertEquals(r.outcome, "failed");
    assertEquals(r.ok, false);
    assertEquals(r.roll.netSuccesses, 0);
    assertEquals(r.roll.botch, false);
  });

  it("returns 'botched' when ones exceed raw successes", () => {
    const char = mkChar({ inUmbra: false });
    const r = stepSideways(char, DEFAULT_GAUNTLET, fixedRoller([1, 1, 2, 3]));
    assertEquals(r.outcome, "botched");
    assertEquals(r.ok, false);
    assertEquals(r.roll.botch, true);
  });

  it("does not mutate the character record", () => {
    const char = mkChar({ inUmbra: false });
    const before = JSON.stringify(char);
    stepSideways(char, DEFAULT_GAUNTLET, fixedRoller([8, 9]));
    assertEquals(JSON.stringify(char), before);
  });

  it("result shape exposes ok, roll, outcome", () => {
    const char = mkChar();
    const r = stepSideways(char, DEFAULT_GAUNTLET, fixedRoller([8]));
    assertEquals(typeof r.ok, "boolean");
    assertEquals(typeof r.outcome, "string");
    assert(Array.isArray(r.roll.dice));
  });

  it("isInUmbra mirrors the char.inUmbra flag", () => {
    assertEquals(isInUmbra(mkChar({ inUmbra: true })), true);
    assertEquals(isInUmbra(mkChar({ inUmbra: false })), false);
    assertEquals(isInUmbra(mkChar({})), false);
  });
});
