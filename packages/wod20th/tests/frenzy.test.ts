// tests/frenzy.test.ts -- WtA frenzy mechanics unit tests.
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import {
  FRENZY_TRIGGERS,
  FRENZY_TURN_MS,
  clearFrenzy,
  enterFrenzy,
  frenzyDuration,
  isFrenzied,
  resistFrenzy,
} from "../core/frenzy.ts";
import type { IDiceRoll } from "../core/dice.ts";
import type { IWoDChar } from "../core/types.ts";

function makeChar(over: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "t1", playerId: "p1", splat: "wta", status: "draft", chargenStep: 1,
    concept: "",
    attributePriority: ["","",""] as [string,string,string],
    attributes: {}, attributeSpecialties: {},
    abilityPriority: ["","",""] as [string,string,string],
    abilities: {}, abilitySpecialties: {},
    backgrounds: {}, willpower: 5,
    rage: 4,
    freebiesRemaining: 15, freebiesLog: [],
    xpTotal: 0, xpSpent: 0, notes: [],
    staffNotes: "", statLog: [], createdAt: 0, updatedAt: 0,
    ...over,
  };
}

function stubRoll(over: Partial<IDiceRoll>): IDiceRoll {
  return {
    pool: 5, difficulty: 7, dice: [5,5,5,5,5],
    rawSuccesses: 0, ones: 0, netSuccesses: 0,
    botch: false, exceptional: false, specialty: false,
    ...over,
  };
}

describe("FRENZY_TRIGGERS", () => {
  it("contains the canonical M20 keys", () => {
    for (const key of ["humiliation","taunt","full-moon","wound","surprise","vampire"]) {
      assert(FRENZY_TRIGGERS[key], `missing trigger: ${key}`);
      assert(FRENZY_TRIGGERS[key].difficulty >= 2);
      assert(FRENZY_TRIGGERS[key].difficulty <= 10);
    }
  });
});

describe("frenzyDuration", () => {
  it("returns rage value as turns", () => {
    assertStrictEquals(frenzyDuration(makeChar({ rage: 4 })), 4);
    assertStrictEquals(frenzyDuration(makeChar({ rage: 0 })), 0);
    assertStrictEquals(frenzyDuration(makeChar({ rage: undefined })), 0);
  });
});

describe("enterFrenzy", () => {
  it("sets state and frenzyUntil from rage", () => {
    const c = makeChar({ rage: 3 });
    const r = enterFrenzy(c, "berserk", false, 1000);
    assertStrictEquals(r.frenzyState, "berserk");
    assertStrictEquals(r.frenzyUntil, 1000 + 3 * FRENZY_TURN_MS);
  });

  it("indefinite sets frenzyUntil=0", () => {
    const r = enterFrenzy(makeChar(), "fox", true, 1000);
    assertStrictEquals(r.frenzyState, "fox");
    assertStrictEquals(r.frenzyUntil, 0);
  });

  it("zero-rage characters get frenzyUntil=0", () => {
    const r = enterFrenzy(makeChar({ rage: 0 }), "berserk", false, 1000);
    assertStrictEquals(r.frenzyUntil, 0);
  });
});

describe("clearFrenzy", () => {
  it("resets state and timer", () => {
    const c = makeChar({ frenzyState: "berserk", frenzyUntil: 999999 });
    const r = clearFrenzy(c);
    assertStrictEquals(r.frenzyState, null);
    assertStrictEquals(r.frenzyUntil, 0);
  });
});

describe("isFrenzied", () => {
  it("false on calm character", () => {
    assertStrictEquals(isFrenzied(makeChar()), false);
  });

  it("true while time remaining", () => {
    const c = makeChar({ frenzyState: "berserk", frenzyUntil: 10_000 });
    assertStrictEquals(isFrenzied(c, 5_000), true);
  });

  it("false after expiry", () => {
    const c = makeChar({ frenzyState: "berserk", frenzyUntil: 10_000 });
    assertStrictEquals(isFrenzied(c, 20_000), false);
  });

  it("indefinite frenzy with state and until=0 is active", () => {
    const c = makeChar({ frenzyState: "fox", frenzyUntil: 0 });
    assertStrictEquals(isFrenzied(c, 999_999_999), true);
  });
});

describe("resistFrenzy", () => {
  it("botch -> berserk regardless of failureState", () => {
    const c = makeChar();
    const r = resistFrenzy(c, "taunt", "fox",
      () => stubRoll({ botch: true, ones: 3 }));
    assertEquals(r.ok, false);
    assertEquals(r.outcome, "berserk");
  });

  it("0 successes -> caller-chosen failureState", () => {
    const c = makeChar();
    const r = resistFrenzy(c, "vampire", "fox",
      () => stubRoll({ netSuccesses: 0 }));
    assertEquals(r.ok, false);
    assertEquals(r.outcome, "fox");
  });

  it(">=1 success -> resisted", () => {
    const c = makeChar();
    const r = resistFrenzy(c, "humiliation", "berserk",
      () => stubRoll({ netSuccesses: 2, rawSuccesses: 2 }));
    assertEquals(r.ok, true);
    assertEquals(r.outcome, "resisted");
  });

  it("throws on unknown trigger", () => {
    let threw = false;
    try { resistFrenzy(makeChar(), "bogus"); } catch { threw = true; }
    assert(threw);
  });
});
