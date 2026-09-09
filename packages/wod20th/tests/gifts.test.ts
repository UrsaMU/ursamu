// tests/gifts.test.ts -- WTA gift database integrity tests
import { assert, assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import { WTA_GIFTS } from "../splats/wta/data/gifts.ts";

const VALID_POOLS = new Set<string>([
  // breeds
  "homid", "metis", "lupus",
  // auspices
  "ragabash", "theurge", "philodox", "galliard", "ahroun",
  // tribes
  "black-furies", "bone-gnawers", "children-of-gaia", "fianna",
  "get-of-fenris", "glass-walkers", "red-talons", "shadow-lords",
  "silent-striders", "silver-fangs", "stargazers", "uktena", "wendigo",
]);

describe("WTA_GIFTS database", () => {
  const entries = Object.values(WTA_GIFTS);

  it("has more than 150 gifts", () => {
    assert(entries.length > 150, `expected >150 gifts, got ${entries.length}`);
  });

  it("has at least 10 gifts at each level 1-5", () => {
    for (let lvl = 1; lvl <= 5; lvl++) {
      const count = entries.filter((g) => g.level === lvl).length;
      assert(count >= 10, `level ${lvl} has only ${count} gifts`);
    }
  });

  it("all source pool IDs are canonical slugs", () => {
    for (const g of entries) {
      assert(g.source.length > 0, `${g.name} has no source pools`);
      for (const pool of g.source) {
        assert(
          VALID_POOLS.has(pool),
          `${g.name} (L${g.level}) has invalid pool "${pool}"`,
        );
      }
    }
  });

  it("no duplicate gift names across levels", () => {
    const byName = new Map<string, number>();
    for (const g of entries) {
      const prev = byName.get(g.name);
      if (prev !== undefined && prev !== g.level) {
        throw new Error(
          `Gift "${g.name}" appears at both level ${prev} and ${g.level}`,
        );
      }
      byName.set(g.name, g.level);
    }
    assertEquals(byName.size > 0, true);
  });
});
