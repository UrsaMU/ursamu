// tests/renownThresholds.test.ts -- Canon-chart sanity + helper coverage.
import { assert, assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import {
  highestEligibleRank,
  meetsRank,
  normaliseAuspice,
  RENOWN_THRESHOLDS,
  thresholdFor,
  type Auspice,
} from "../core/renownThresholds.ts";

describe("normaliseAuspice", () => {
  it("accepts canonical ids", () => {
    for (const id of ["ragabash", "theurge", "philodox", "galliard", "ahroun"]) {
      assertEquals(normaliseAuspice(id), id);
    }
  });
  it("lowercases input", () => {
    assertEquals(normaliseAuspice("Ahroun"), "ahroun");
    assertEquals(normaliseAuspice("  THEURGE  "), "theurge");
  });
  it("rejects unknown and empty", () => {
    assertEquals(normaliseAuspice("garou"), null);
    assertEquals(normaliseAuspice(""), null);
    assertEquals(normaliseAuspice(undefined), null);
    assertEquals(normaliseAuspice(null), null);
  });
});

describe("meetsRank", () => {
  it("true when perm >= req per track", () => {
    assert(meetsRank({ glory: 3, honor: 3, wisdom: 3 }, { glory: 3, honor: 0, wisdom: 0 }));
  });
  it("false when any track short", () => {
    assert(!meetsRank({ glory: 2, honor: 3, wisdom: 3 }, { glory: 3, honor: 0, wisdom: 0 }));
  });
});

describe("highestEligibleRank", () => {
  it("returns 1 with no renown", () => {
    assertEquals(highestEligibleRank("ahroun", { glory: 0, honor: 0, wisdom: 0 }), 1);
  });
  it("ahroun with 3/0/0 perm is eligible for rank 2", () => {
    assertEquals(highestEligibleRank("ahroun", { glory: 3, honor: 0, wisdom: 0 }), 2);
  });
  it("ahroun with 13/8/7 perm is eligible for rank 4", () => {
    assertEquals(highestEligibleRank("ahroun", { glory: 13, honor: 8, wisdom: 7 }), 4);
  });
  it("ragabash with 15/15/15 perm is eligible for rank 5", () => {
    assertEquals(highestEligibleRank("ragabash", { glory: 15, honor: 15, wisdom: 15 }), 5);
  });
  it("ragabash with 15/15/14 perm caps at rank 4", () => {
    assertEquals(highestEligibleRank("ragabash", { glory: 15, honor: 15, wisdom: 14 }), 4);
  });
});

describe("thresholdFor (canon spot-checks)", () => {
  it("ahroun R2 = 3/0/0", () => {
    assertEquals(thresholdFor("ahroun", 2), { glory: 3, honor: 0, wisdom: 0 });
  });
  it("philodox R3 = 3/7/3", () => {
    assertEquals(thresholdFor("philodox", 3), { glory: 3, honor: 7, wisdom: 3 });
  });
  it("theurge R5 = 15/15/19", () => {
    assertEquals(thresholdFor("theurge", 5), { glory: 15, honor: 15, wisdom: 19 });
  });
  it("ragabash R4 = 8/8/8 (balanced)", () => {
    assertEquals(thresholdFor("ragabash", 4), { glory: 8, honor: 8, wisdom: 8 });
  });
});

describe("RENOWN_THRESHOLDS shape", () => {
  it("covers all 5 auspices x 4 advanceable ranks", () => {
    const auspices: Auspice[] = ["ragabash", "theurge", "philodox", "galliard", "ahroun"];
    for (const a of auspices) {
      for (const r of [2, 3, 4, 5] as const) {
        assert(RENOWN_THRESHOLDS[a][r], `missing ${a} R${r}`);
      }
    }
  });
});
