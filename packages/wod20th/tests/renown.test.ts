// tests/renown.test.ts -- Unit tests for renown award/loss and rank advancement.
import { assert, assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import {
  awardRenown,
  loseRenown,
  maybeAdvanceRank,
  nextRankRequirement,
} from "../core/renown.ts";
import type { IWoDChar } from "../core/types.ts";

function wtaChar(overrides: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "t-1",
    playerId: "p-1",
    splat: "wta",
    status: "approved",
    chargenStep: 6,
    concept: "Warrior",
    auspice: "ahroun",
    attributePriority: ["physical", "social", "mental"],
    attributes: {},
    attributeSpecialties: {},
    abilityPriority: ["talents", "skills", "knowledges"],
    abilities: {},
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 4,
    rank: 1,
    renown: { glory: 0, honor: 0, wisdom: 0 },
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("awardRenown", () => {
  it("rejects zero", () => {
    const c = wtaChar();
    const r = awardRenown(c, "glory", 0);
    assertEquals(r.ok, false);
  });
  it("rejects negative", () => {
    const c = wtaChar();
    const r = awardRenown(c, "glory", -2);
    assertEquals(r.ok, false);
  });
  it("rejects non-integer", () => {
    const c = wtaChar();
    const r = awardRenown(c, "glory", 1.5);
    assertEquals(r.ok, false);
  });
  it("accumulates in renownTemp", () => {
    const c = wtaChar();
    awardRenown(c, "glory", 2);
    awardRenown(c, "glory", 3);
    awardRenown(c, "honor", 1);
    assertEquals(c.renownTemp?.glory, 5);
    assertEquals(c.renownTemp?.honor, 1);
    assertEquals(c.renownTemp?.wisdom, 0);
  });
  it("initialises renownTemp on first call", () => {
    const c = wtaChar();
    assertEquals(c.renownTemp, undefined);
    awardRenown(c, "wisdom", 1);
    assertEquals(c.renownTemp?.wisdom, 1);
  });
});

describe("loseRenown", () => {
  it("clamps at zero", () => {
    const c = wtaChar({ renownTemp: { glory: 2, honor: 0, wisdom: 0 } });
    const r = loseRenown(c, "glory", 5);
    assert(r.ok);
    assertEquals(c.renownTemp?.glory, 0);
  });
  it("rejects bad amount", () => {
    const c = wtaChar();
    assertEquals(loseRenown(c, "honor", 0).ok, false);
    assertEquals(loseRenown(c, "honor", -1).ok, false);
  });
});

describe("maybeAdvanceRank (per-auspice)", () => {
  it("ahroun does not advance with only 2 glory (needs 3)", () => {
    const c = wtaChar({ auspice: "ahroun" });
    awardRenown(c, "glory", 2);
    const r = maybeAdvanceRank(c);
    assertEquals(r.advanced, false);
    assertEquals(c.rank, 1);
  });
  it("ahroun advances at exactly 3 glory", () => {
    const c = wtaChar({ auspice: "ahroun" });
    awardRenown(c, "glory", 3);
    const r = maybeAdvanceRank(c);
    assertEquals(r.advanced, true);
    assertEquals(r.newRank, 2);
    assertEquals(c.rank, 2);
  });
  it("philodox needs honor, not glory", () => {
    const c = wtaChar({ auspice: "philodox" });
    awardRenown(c, "glory", 10);
    assertEquals(maybeAdvanceRank(c).advanced, false);
    awardRenown(c, "honor", 3);
    assertEquals(maybeAdvanceRank(c).advanced, true);
    assertEquals(c.rank, 2);
  });
  it("theurge needs wisdom", () => {
    const c = wtaChar({ auspice: "theurge" });
    awardRenown(c, "glory", 10);
    awardRenown(c, "honor", 10);
    assertEquals(maybeAdvanceRank(c).advanced, false);
    awardRenown(c, "wisdom", 3);
    assertEquals(maybeAdvanceRank(c).advanced, true);
  });
  it("galliard same chart as ahroun", () => {
    const c = wtaChar({ auspice: "galliard" });
    awardRenown(c, "glory", 3);
    assertEquals(maybeAdvanceRank(c).advanced, true);
  });
  it("ragabash needs 1/1/1 for rank 2", () => {
    const c = wtaChar({ auspice: "ragabash" });
    awardRenown(c, "glory", 1);
    awardRenown(c, "honor", 1);
    assertEquals(maybeAdvanceRank(c).advanced, false); // missing wisdom
    awardRenown(c, "wisdom", 1);
    assertEquals(maybeAdvanceRank(c).advanced, true);
    assertEquals(c.rank, 2);
  });
  it("rank-up folds temp into permanent and zeroes temp", () => {
    const c = wtaChar({ auspice: "ragabash" });
    awardRenown(c, "glory", 1);
    awardRenown(c, "honor", 1);
    awardRenown(c, "wisdom", 1);
    const r = maybeAdvanceRank(c);
    assert(r.advanced);
    assertEquals(c.rank, 2);
    assertEquals(c.renown?.glory, 1);
    assertEquals(c.renown?.honor, 1);
    assertEquals(c.renown?.wisdom, 1);
    assertEquals(c.renownTemp?.glory, 0);
    assertEquals(c.renownTemp?.honor, 0);
    assertEquals(c.renownTemp?.wisdom, 0);
  });
  it("does not double-advance on a single call (single rank step)", () => {
    // Ragabash R2 needs 1/1/1; R3 needs 3/3/3. Even with 3/3/3 temp,
    // a single maybeAdvanceRank call from rank 1 advances to 2 only.
    const c = wtaChar({ auspice: "ragabash" });
    awardRenown(c, "glory", 3);
    awardRenown(c, "honor", 3);
    awardRenown(c, "wisdom", 3);
    const r1 = maybeAdvanceRank(c);
    assert(r1.advanced);
    assertEquals(c.rank, 2);
    // Temp is zeroed; perm is 3/3/3 which meets R3 cumulative.
    const r2 = maybeAdvanceRank(c);
    assert(r2.advanced);
    assertEquals(c.rank, 3);
  });
  it("rank 5 cannot advance", () => {
    const c = wtaChar({ auspice: "ahroun", rank: 5 });
    awardRenown(c, "glory", 100);
    const r = maybeAdvanceRank(c);
    assertEquals(r.advanced, false);
    assertEquals(c.rank, 5);
  });
  it("missing auspice blocks rank advancement", () => {
    const c = wtaChar({ auspice: undefined });
    awardRenown(c, "glory", 100);
    awardRenown(c, "honor", 100);
    awardRenown(c, "wisdom", 100);
    const r = maybeAdvanceRank(c);
    assertEquals(r.advanced, false);
    assertEquals(c.rank, 1);
  });
  it("unknown auspice value blocks rank advancement", () => {
    const c = wtaChar({ auspice: "mystery-moon" });
    awardRenown(c, "glory", 100);
    awardRenown(c, "honor", 100);
    awardRenown(c, "wisdom", 100);
    assertEquals(maybeAdvanceRank(c).advanced, false);
  });
  it("does not demote: pre-set high rank with low renown stays put", () => {
    const c = wtaChar({ auspice: "ahroun", rank: 4, renown: { glory: 1, honor: 0, wisdom: 0 } });
    const r = maybeAdvanceRank(c);
    assertEquals(r.advanced, false);
    assertEquals(c.rank, 4);
  });
});

describe("nextRankRequirement", () => {
  it("returns per-track needed and combined have", () => {
    const c = wtaChar({ auspice: "ahroun" });
    awardRenown(c, "glory", 2);
    const req = nextRankRequirement(c);
    assertEquals(req.rank, 2);
    assertEquals(req.needed.glory, 3);
    assertEquals(req.needed.honor, 0);
    assertEquals(req.needed.wisdom, 0);
    assertEquals(req.have.glory, 2);
  });
  it("rank 5 returns zero requirements", () => {
    const c = wtaChar({ rank: 5 });
    const req = nextRankRequirement(c);
    assertEquals(req.needed.glory, 0);
    assertEquals(req.needed.honor, 0);
    assertEquals(req.needed.wisdom, 0);
  });
  it("missing auspice returns zero requirements (no auto-advance)", () => {
    const c = wtaChar({ auspice: undefined });
    const req = nextRankRequirement(c);
    assertEquals(req.needed.glory, 0);
    assertEquals(req.needed.honor, 0);
    assertEquals(req.needed.wisdom, 0);
  });
});
