// tests/spot.test.ts -- conceal difficulty mapping.
import { assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import { CONCEAL_DIFFICULTY } from "../core/eq.ts";
import { concealDifficulty } from "../core/spot.ts";

describe("CONCEAL_DIFFICULTY", () => {
  it("P (Pocket) = 8", () => { assertEquals(CONCEAL_DIFFICULTY.P, 8); });
  it("J (Jacket) = 7", () => { assertEquals(CONCEAL_DIFFICULTY.J, 7); });
  it("T (Trenchcoat) = 6", () => { assertEquals(CONCEAL_DIFFICULTY.T, 6); });
  it("N (Not concealable) = auto", () => { assertEquals(CONCEAL_DIFFICULTY.N, "auto"); });
});

describe("concealDifficulty()", () => {
  it("returns 8 for P-rated items", () => {
    assertEquals(concealDifficulty({ state: { concealability: "P" } }), 8);
  });
  it("returns 7 for J-rated items", () => {
    assertEquals(concealDifficulty({ state: { concealability: "J" } }), 7);
  });
  it("returns 6 for T-rated items", () => {
    assertEquals(concealDifficulty({ state: { concealability: "T" } }), 6);
  });
  it("returns 'auto' for N-rated items", () => {
    assertEquals(concealDifficulty({ state: { concealability: "N" } }), "auto");
  });
  it("falls back to 6 (Trenchcoat) when concealability is unset", () => {
    assertEquals(concealDifficulty({ state: {} }), 6);
    assertEquals(concealDifficulty({}), 6);
  });
  it("falls back to 6 when concealability is unrecognised", () => {
    assertEquals(concealDifficulty({ state: { concealability: "Q" } }), 6);
  });
});
