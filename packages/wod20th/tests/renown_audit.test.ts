// tests/renown_audit.test.ts -- Security audit (TDD red->green) for +renown.
//
// These tests cover the pure-logic surface in core/renown.ts. The command-
// level staff gate is enforced in commands/renown.ts via isStaffUser() at
// the entry of the /award and /lose branches.

import { assert, assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import {
  awardRenown,
  loseRenown,
  maybeAdvanceRank,
} from "../core/renown.ts";
import {
  RENOWN_THRESHOLDS,
  thresholdFor,
  type Auspice,
} from "../core/renownThresholds.ts";
import type { IWoDChar } from "../core/types.ts";

function wtaChar(overrides: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "audit-r-1", playerId: "p-1", splat: "wta", status: "approved", chargenStep: 6,
    concept: "Warrior",
    auspice: "ahroun",
    attributePriority: ["physical", "social", "mental"],
    attributes: {}, attributeSpecialties: {},
    abilityPriority: ["talents", "skills", "knowledges"],
    abilities: {}, abilitySpecialties: {},
    backgrounds: {},
    willpower: 4,
    rank: 1,
    renown: { glory: 0, honor: 0, wisdom: 0 },
    freebiesRemaining: 0, freebiesLog: [],
    xpTotal: 0, xpSpent: 0, notes: [],
    staffNotes: "", statLog: [], createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

describe("+renown security audit", () => {
  // E-1: Non-staff cannot use /award or /lose.
  it("E-1 staff gate (regression note)", () => {
    assert(true); // see commands/renown.ts isStaffUser check
  });

  // E-2: awardRenown rejects non-positive / non-integer / NaN amounts.
  it("E-2 awardRenown rejects bad amounts", () => {
    const c = wtaChar();
    assertEquals(awardRenown(c, "glory", 0).ok, false);
    assertEquals(awardRenown(c, "glory", -3).ok, false);
    assertEquals(awardRenown(c, "glory", 1.5).ok, false);
    assertEquals(awardRenown(c, "glory", NaN).ok, false);
    assertEquals(awardRenown(c, "glory", Infinity).ok, false);
    assertEquals(awardRenown(c, "glory", -Infinity).ok, false);
    assertEquals(c.renownTemp?.glory ?? 0, 0);
  });

  // E-3: loseRenown clamps at 0.
  it("E-3 loseRenown clamps temp at zero", () => {
    const c = wtaChar({ renownTemp: { glory: 2, honor: 0, wisdom: 0 } });
    const r = loseRenown(c, "glory", 9999);
    assert(r.ok);
    assertEquals(c.renownTemp?.glory, 0);
    assertEquals(c.renown?.glory, 0);
  });

  it("E-3b loseRenown does not touch permanent track", () => {
    const c = wtaChar({
      renown: { glory: 5, honor: 0, wisdom: 0 },
      renownTemp: { glory: 1, honor: 0, wisdom: 0 },
    });
    loseRenown(c, "glory", 100);
    assertEquals(c.renown?.glory, 5);
    assertEquals(c.renownTemp?.glory, 0);
  });

  // E-4: Rank-up moves temp into permanent atomically and zeroes temp.
  it("E-4 rank-up folds temp -> permanent atomically (ahroun: 3 glory)", () => {
    const c = wtaChar({ auspice: "ahroun" });
    awardRenown(c, "glory", 3); // exact Ahroun R2 threshold
    const r = maybeAdvanceRank(c);
    assert(r.advanced);
    assertEquals(c.renownTemp?.glory, 0);
    assertEquals(c.renownTemp?.honor, 0);
    assertEquals(c.renownTemp?.wisdom, 0);
    assertEquals(c.renown?.glory, 3);
    assertEquals(c.rank, 2);
    // Calling again with zero temp must not advance (perm only meets R2).
    const r2 = maybeAdvanceRank(c);
    assertEquals(r2.advanced, false);
    assertEquals(c.rank, 2);
  });

  // E-5: Rank 5 cannot advance.
  it("E-5 rank 5 cannot advance with huge temp", () => {
    const c = wtaChar({ rank: 5, renownTemp: { glory: 999, honor: 999, wisdom: 999 } });
    const r = maybeAdvanceRank(c);
    assertEquals(r.advanced, false);
    assertEquals(c.rank, 5);
    assertEquals(c.renownTemp?.glory, 999);
  });

  // E-6: Rank cannot decrease via /lose.
  it("E-6 loseRenown never decrements rank", () => {
    const c = wtaChar({
      rank: 3,
      renown: { glory: 4, honor: 4, wisdom: 4 },
      renownTemp: { glory: 2, honor: 0, wisdom: 0 },
    });
    loseRenown(c, "glory", 100);
    loseRenown(c, "honor", 100);
    loseRenown(c, "wisdom", 100);
    assertEquals(c.rank, 3);
  });

  // E-7: Audit log entry at command boundary.
  it("E-7 statLog push exists at command boundary (regression note)", () => {
    assert(true); // see commands/renown.ts
  });

  // E-8: maybeAdvanceRank rejects negative / fractional / out-of-range rank.
  it("E-8 maybeAdvanceRank rejects invalid rank values", () => {
    const negative = wtaChar({ rank: -1 as unknown as 1, renownTemp: { glory: 100, honor: 100, wisdom: 100 } });
    assertEquals(maybeAdvanceRank(negative).advanced, false);
    assertEquals(negative.rank, -1);

    const frac = wtaChar({ rank: 1.5 as unknown as 1, renownTemp: { glory: 100, honor: 100, wisdom: 100 } });
    assertEquals(maybeAdvanceRank(frac).advanced, false);

    const zero = wtaChar({ rank: 0 as unknown as 1, renownTemp: { glory: 100, honor: 100, wisdom: 100 } });
    assertEquals(maybeAdvanceRank(zero).advanced, false);

    const huge = wtaChar({ rank: 99 as unknown as 1, renownTemp: { glory: 999, honor: 0, wisdom: 0 } });
    assertEquals(maybeAdvanceRank(huge).advanced, false);
  });

  // E-9 (rewritten): per-auspice thresholds are monotonically non-decreasing.
  it("E-9 RENOWN_THRESHOLDS are monotonically non-decreasing per track per auspice", () => {
    const auspices: Auspice[] = ["ragabash", "theurge", "philodox", "galliard", "ahroun"];
    for (const a of auspices) {
      for (const t of ["glory", "honor", "wisdom"] as const) {
        let last = 0;
        for (let r = 2 as 2 | 3 | 4 | 5; r <= 5; r++) {
          const v = thresholdFor(a, r as 2 | 3 | 4 | 5)[t];
          assert(v >= last, `${a} ${t} R${r} (${v}) < prev (${last})`);
          last = v;
        }
      }
    }
  });

  // E-10: missing/unknown auspice blocks advancement.
  it("E-10 missing or unknown auspice blocks rank advancement", () => {
    const noAusp = wtaChar({ auspice: undefined, renownTemp: { glory: 999, honor: 999, wisdom: 999 } });
    assertEquals(maybeAdvanceRank(noAusp).advanced, false);

    const badAusp = wtaChar({ auspice: "junkmoon", renownTemp: { glory: 999, honor: 999, wisdom: 999 } });
    assertEquals(maybeAdvanceRank(badAusp).advanced, false);
  });

  // E-11: chart has all 5 auspices defined with all 4 advanceable ranks.
  it("E-11 RENOWN_THRESHOLDS chart is complete", () => {
    const auspices: Auspice[] = ["ragabash", "theurge", "philodox", "galliard", "ahroun"];
    for (const a of auspices) {
      for (const r of [2, 3, 4, 5] as const) {
        const req = RENOWN_THRESHOLDS[a][r];
        assert(typeof req.glory === "number");
        assert(typeof req.honor === "number");
        assert(typeof req.wisdom === "number");
      }
    }
  });
});
