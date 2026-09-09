// tests/wounds.test.ts -- M20 wound penalty unit tests.
import { assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import {
  WOUND_PENALTIES,
  INCAP_INDEX,
  woundPenalty,
  isIncapacitated,
  appliedPool,
} from "../core/wounds.ts";
import { HEALTH_TRACK_SIZE } from "../core/health.ts";
import type { IWoDChar, DamageMark } from "../core/types.ts";

function mkChar(track?: DamageMark[]): IWoDChar {
  return {
    id: "c1",
    playerId: "p1",
    splat: "wta",
    status: "approved",
    chargenStep: 6,
    concept: "test",
    attributePriority: ["", "", ""],
    attributes: {},
    attributesTemp: {},
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {},
    abilitiesTemp: {},
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 6,
    rage: 3,
    gnosis: 5,
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: 0,
    updatedAt: 0,
    healthTrack: track as DamageMark[] | undefined,
  } as unknown as IWoDChar;
}

/** Build a track with `n` filled slots from index 0 (heaviest-left layout). */
function trackWith(n: number, mark: DamageMark = "B"): DamageMark[] {
  const t: DamageMark[] = Array(HEALTH_TRACK_SIZE).fill("");
  for (let i = 0; i < n && i < HEALTH_TRACK_SIZE; i++) t[i] = mark;
  return t;
}

describe("WOUND_PENALTIES", () => {
  it("covers indices 0..5 per M20 canon", () => {
    assertEquals(WOUND_PENALTIES.length, 6);
    assertEquals(WOUND_PENALTIES[0], 0); // Bruised
    assertEquals(WOUND_PENALTIES[1], 1); // Hurt
    assertEquals(WOUND_PENALTIES[2], 1); // Injured
    assertEquals(WOUND_PENALTIES[3], 2); // Wounded
    assertEquals(WOUND_PENALTIES[4], 2); // Mauled
    assertEquals(WOUND_PENALTIES[5], 5); // Crippled
  });
  it("INCAP_INDEX is 6", () => assertEquals(INCAP_INDEX, 6));
});

describe("woundPenalty", () => {
  it("returns 0 for an undefined track", () => {
    assertEquals(woundPenalty(mkChar(undefined)), 0);
  });
  it("returns 0 for an empty track", () => {
    assertEquals(woundPenalty(mkChar([])), 0);
  });
  it("returns 0 when only Bruised(0) is filled", () => {
    assertEquals(woundPenalty(mkChar(trackWith(1))), 0);
  });
  it("returns -1 at Hurt(1)",     () => assertEquals(woundPenalty(mkChar(trackWith(2))), 1));
  it("returns -1 at Injured(2)",  () => assertEquals(woundPenalty(mkChar(trackWith(3))), 1));
  it("returns -2 at Wounded(3)",  () => assertEquals(woundPenalty(mkChar(trackWith(4))), 2));
  it("returns -2 at Mauled(4)",   () => assertEquals(woundPenalty(mkChar(trackWith(5))), 2));
  it("returns -5 at Crippled(5)", () => assertEquals(woundPenalty(mkChar(trackWith(6))), 5));
  it("clamps Incap(6) to the Crippled penalty", () => {
    assertEquals(woundPenalty(mkChar(trackWith(7))), 5);
  });
  it("treats highest filled index as the active level even with gaps", () => {
    const t: DamageMark[] = Array(HEALTH_TRACK_SIZE).fill("");
    t[0] = "A";
    t[4] = "L"; // Mauled slot filled, gaps before
    assertEquals(woundPenalty(mkChar(t)), 2);
  });
  it("handles tracks shorter than HEALTH_TRACK_SIZE", () => {
    // Only 3 slots, last one filled -> Injured penalty
    assertEquals(woundPenalty(mkChar(["B", "B", "B"])), 1);
  });
});

describe("isIncapacitated", () => {
  it("is false for an empty/undefined track", () => {
    assertEquals(isIncapacitated(mkChar(undefined)), false);
    assertEquals(isIncapacitated(mkChar([])),        false);
  });
  it("is false when only Crippled is filled", () => {
    assertEquals(isIncapacitated(mkChar(trackWith(6))), false);
  });
  it("is true when slot 6 is filled", () => {
    assertEquals(isIncapacitated(mkChar(trackWith(7))), true);
  });
});

describe("appliedPool", () => {
  it("returns unchanged pool when undamaged", () => {
    const r = appliedPool(mkChar(undefined), 8);
    assertEquals(r, { pool: 8, penalty: 0, incap: false });
  });
  it("subtracts the wound penalty", () => {
    const r = appliedPool(mkChar(trackWith(4)), 8); // Wounded -2
    assertEquals(r, { pool: 6, penalty: 2, incap: false });
  });
  it("floors the reduced pool at 0", () => {
    const r = appliedPool(mkChar(trackWith(6)), 3); // Crippled -5, pool 3
    assertEquals(r.pool, 0);
    assertEquals(r.penalty, 5);
    assertEquals(r.incap, false);
  });
  it("reports incap when slot 6 is filled", () => {
    const r = appliedPool(mkChar(trackWith(7)), 5);
    assertEquals(r.incap, true);
  });
});
