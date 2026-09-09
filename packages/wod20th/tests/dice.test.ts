// tests/dice.test.ts -- WoD20th dice engine unit tests.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import "../splats/wta/index.ts";

import { evaluateRoll, resolvePoolExpr } from "../core/dice.ts";
import type { IWoDChar } from "../core/types.ts";

// -- evaluateRoll -----------------------------------------------------------

describe("evaluateRoll", () => {
  it("counts dice >= difficulty as successes", () => {
    const r = evaluateRoll([3, 6, 8, 10], 6);
    assertStrictEquals(r.rawSuccesses, 3); // 6, 8, 10
  });

  it("counts 1s as botch dice", () => {
    const r = evaluateRoll([1, 6, 8], 6);
    assertStrictEquals(r.ones, 1);
    assertStrictEquals(r.netSuccesses, 1); // 2 hits - 1 one
  });

  it("botch: ones exceed raw successes, net = 0", () => {
    const r = evaluateRoll([1, 1, 3, 4], 6);
    assertStrictEquals(r.botch, true);
    assertStrictEquals(r.netSuccesses, 0);
  });

  it("no botch when ones do not exceed raw successes", () => {
    const r = evaluateRoll([1, 6, 8], 6);
    assertStrictEquals(r.botch, false);
  });

  it("failure (no successes, no ones) is not a botch", () => {
    const r = evaluateRoll([2, 3, 4, 5], 6);
    assertStrictEquals(r.botch, false);
    assertStrictEquals(r.netSuccesses, 0);
  });

  it("exceptional success at 5+ net successes", () => {
    const r = evaluateRoll([6, 7, 8, 9, 10], 6);
    assertStrictEquals(r.exceptional, true);
    assertStrictEquals(r.netSuccesses, 5);
  });

  it("specialty: 10s count as 2 successes", () => {
    const r = evaluateRoll([10, 10, 3], 6, true);
    assertStrictEquals(r.rawSuccesses, 4); // 2×2
  });

  it("specialty flag carried through", () => {
    const r = evaluateRoll([8], 6, true);
    assertStrictEquals(r.specialty, true);
  });

  it("difficulty clamped to 2-10", () => {
    const low  = evaluateRoll([5], 1);
    const high = evaluateRoll([5], 11);
    assertStrictEquals(low.difficulty, 2);
    assertStrictEquals(high.difficulty, 10);
  });

  it("ones cancel successes but net never goes below 0", () => {
    const r = evaluateRoll([1, 1, 1, 3, 4], 6); // 3 ones, 0 hits
    assertStrictEquals(r.netSuccesses, 0);
    assertStrictEquals(r.botch, true);
  });
});

// -- resolvePoolExpr --------------------------------------------------------

function makeChar(): IWoDChar {
  return {
    id: "t1", playerId: "p1", splat: "wta", status: "draft", chargenStep: 1,
    concept: "", attributePriority: ["","",""] as [string,string,string],
    attributes: { Strength: 2, Dexterity: 1, Brawl: 3 },
    attributeSpecialties: {},
    abilityPriority: ["","",""] as [string,string,string],
    abilities: { Brawl: 3, Melee: 2 },
    abilitySpecialties: {},
    backgrounds: {}, willpower: 3,
    freebiesRemaining: 15, freebiesLog: [],
    xpTotal: 0, xpSpent: 0, notes: [],
    staffNotes: "", statLog: [], createdAt: 0, updatedAt: 0,
  };
}

describe("resolvePoolExpr", () => {
  it("resolves a plain number", () => {
    const r = resolvePoolExpr(makeChar(), "8");
    assertEquals(r?.pool, 8);
    assertEquals(r?.pubLabel, "8");
    assertEquals(r?.privLabel, "8");
  });

  it("resolves a single attribute (base 1 + extras)", () => {
    const r = resolvePoolExpr(makeChar(), "Strength");
    assertEquals(r?.pool, 3); // base 1 + 2 extras
  });

  it("resolves a single ability", () => {
    const r = resolvePoolExpr(makeChar(), "Brawl");
    assertEquals(r?.pool, 3);
  });

  it("resolves Strength+Brawl expression", () => {
    const r = resolvePoolExpr(makeChar(), "Strength+Brawl");
    assertEquals(r?.pool, 6); // 3 + 3
  });

  it("resolves expression with numeric modifier", () => {
    const r = resolvePoolExpr(makeChar(), "Dexterity+2");
    assertEquals(r?.pool, 4); // (1+1) + 2
  });

  it("returns null for unknown trait", () => {
    const r = resolvePoolExpr(makeChar(), "Charisma+Foo");
    assertStrictEquals(r, null);
  });

  it("pubLabel has no values, privLabel has values", () => {
    const r = resolvePoolExpr(makeChar(), "Strength+Brawl");
    assertEquals(r?.pubLabel,  "Strength + Brawl");
    assertEquals(r?.privLabel, "Strength(3) + Brawl(3)");
  });

  it("partial prefix 'str' resolves to Strength", () => {
    const r = resolvePoolExpr(makeChar(), "str+braw");
    assertEquals(r?.pool, 6);
    assertEquals(r?.pubLabel, "Strength + Brawl");
  });

  it("case-insensitive exact match", () => {
    const r = resolvePoolExpr(makeChar(), "BRAWL");
    assertEquals(r?.pool, 3);
  });
});
