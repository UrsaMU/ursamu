// tests/pools.test.ts -- Unit tests for spendPool / regainPool.
import { assert, assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import { regainPool, spendPool } from "../core/pools.ts";
import type { IWoDChar } from "../core/types.ts";

/** Build a minimal IWoDChar for pool tests; only the relevant fields matter. */
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
    rage: 5,
    gnosis: 4,
    ...overrides,
  };
}

describe("spendPool", () => {
  it("rejects zero", () => {
    const r = spendPool(mkChar(), "rage", 0);
    assertEquals(r.ok, false);
  });
  it("rejects negative", () => {
    const r = spendPool(mkChar(), "rage", -1);
    assertEquals(r.ok, false);
  });
  it("rejects non-integer", () => {
    const r = spendPool(mkChar(), "rage", 1.5);
    assertEquals(r.ok, false);
  });
  it("rejects NaN/Infinity", () => {
    assertEquals(spendPool(mkChar(), "rage", NaN).ok, false);
    assertEquals(spendPool(mkChar(), "rage", Infinity).ok, false);
  });
  it("rejects insufficient pool", () => {
    const c = mkChar({ rage: 5, rageCurrent: 2 });
    const r = spendPool(c, "rage", 3);
    assertEquals(r.ok, false);
  });
  it("succeeds and returns remaining", () => {
    const c = mkChar({ rage: 5, rageCurrent: 4 });
    const r = spendPool(c, "rage", 2);
    assertEquals(r.ok, true);
    assertEquals(r.remaining, 2);
  });
  it("defaults current to permanent when unset", () => {
    const c = mkChar({ rage: 5 });
    const r = spendPool(c, "rage", 5);
    assertEquals(r.ok, true);
    assertEquals(r.remaining, 0);
  });
  it("rejects when pool is missing", () => {
    const c = mkChar({ rage: undefined });
    const r = spendPool(c, "rage", 1);
    assertEquals(r.ok, false);
  });
  it("uses willpower fields for the willpower pool", () => {
    const c = mkChar({ willpower: 6, willpowerCurrent: 3 });
    const r = spendPool(c, "willpower", 2);
    assertEquals(r.ok, true);
    assertEquals(r.remaining, 1);
  });
  it("uses gnosis fields for the gnosis pool", () => {
    const c = mkChar({ gnosis: 4, gnosisCurrent: 4 });
    const r = spendPool(c, "gnosis", 1);
    assertEquals(r.ok, true);
    assertEquals(r.remaining, 3);
  });
});

describe("regainPool", () => {
  it("rejects zero", () => {
    assertEquals(regainPool(mkChar(), "rage", 0).ok, false);
  });
  it("rejects negative", () => {
    assertEquals(regainPool(mkChar(), "rage", -2).ok, false);
  });
  it("rejects non-integer", () => {
    assertEquals(regainPool(mkChar(), "rage", 1.2).ok, false);
  });
  it("caps at permanent", () => {
    const c = mkChar({ rage: 5, rageCurrent: 4 });
    const r = regainPool(c, "rage", 10);
    assertEquals(r.ok, true);
    assertEquals(r.current, 5);
  });
  it("increments below cap", () => {
    const c = mkChar({ gnosis: 6, gnosisCurrent: 2 });
    const r = regainPool(c, "gnosis", 3);
    assertEquals(r.ok, true);
    assertEquals(r.current, 5);
  });
  it("noops gracefully when already full", () => {
    const c = mkChar({ rage: 5, rageCurrent: 5 });
    const r = regainPool(c, "rage", 2);
    assertEquals(r.ok, true);
    assertEquals(r.current, 5);
    assert(r.message.toLowerCase().includes("full"));
  });
  it("rejects when pool is missing", () => {
    const c = mkChar({ gnosis: undefined });
    const r = regainPool(c, "gnosis", 1);
    assertEquals(r.ok, false);
  });
  it("uses willpower fields for the willpower pool", () => {
    const c = mkChar({ willpower: 7, willpowerCurrent: 5 });
    const r = regainPool(c, "willpower", 1);
    assertEquals(r.ok, true);
    assertEquals(r.current, 6);
  });
});
