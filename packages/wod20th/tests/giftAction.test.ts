// tests/giftAction.test.ts -- pure gift-activation logic.
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import { activateGift, knowsGift } from "../core/giftAction.ts";
import { WTA_GIFTS } from "../splats/wta/data/gifts.ts";
import type { IWoDChar } from "../core/types.ts";

function makeChar(overrides: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "test-char",
    playerId: "p1",
    splat: "wta",
    status: "approved",
    chargenStep: 6,
    concept: "Test",
    attributePriority: ["physical", "social", "mental"],
    attributes: {},
    attributeSpecialties: {},
    abilityPriority: ["talents", "skills", "knowledges"],
    abilities: {},
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 3,
    gnosis: 6,
    gnosisCurrent: 6,
    rage: 3,
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    staffNotes: "",
    statLog: [],
    notes: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("activateGift", () => {
  it("returns ok=true for a known gift", () => {
    const char = makeChar({ gifts: ["Mother's Touch"] });
    const r = activateGift(char, "mothers-touch");
    assert(r.ok, r.message);
    assertEquals(r.slug, "mother's touch");
    assertEquals(r.name, "Mother's Touch");
    assertEquals(r.level, 1);
    assertEquals(r.cost, 1);
  });

  it("returns ok=false for unknown slug", () => {
    const char = makeChar({ gifts: ["Mother's Touch"] });
    const r = activateGift(char, "not-a-real-gift");
    assertFalse(r.ok);
    assert(r.message.toLowerCase().includes("unknown"));
  });

  it("returns ok=false when char has not learned the gift", () => {
    const char = makeChar({ gifts: ["Spirit Speech"] });
    const r = activateGift(char, "mothers-touch");
    assertFalse(r.ok);
    assert(r.message.includes("Mother's Touch"));
  });

  it("cost equals level for every catalog entry (legacy path)", () => {
    for (const [slug, def] of Object.entries(WTA_GIFTS)) {
      if (def.action) continue; // action-bearing gifts use structured cost
      const char = makeChar({ gifts: [def.name] });
      const r = activateGift(char, slug);
      assert(r.ok, `${slug}: ${r.message}`);
      assertEquals(r.cost, def.level, `${slug}: cost should equal level`);
    }
  });

  it("action-bearing gifts return structured costBreakdown", () => {
    // Mother's Touch is wired with { gnosis: 1 } and a roll.
    const char = makeChar({
      gifts: ["Mother's Touch"],
      attributes: { Intelligence: 3 },
      abilities: { Empathy: 2 },
    });
    const r = activateGift(char, "mothers-touch");
    assert(r.ok, r.message);
    assertEquals(r.costBreakdown?.gnosis, 1);
    assert(r.roll, "should produce a roll when action.roll present");
    assertEquals(r.poolLabel, "Intelligence+Empathy");
    assertEquals(r.poolSize, 4 + 2); // (1+3) + 2
  });

  it("normalizes slug (case + whitespace)", () => {
    const char = makeChar({ gifts: ["Mother's Touch"] });
    const r = activateGift(char, "  MOTHERS-TOUCH  ");
    assert(r.ok, r.message);
    assertEquals(r.slug, "mother's touch");
  });

  it("rejects empty slug", () => {
    const char = makeChar({ gifts: ["Mother's Touch"] });
    const r = activateGift(char, "");
    assertFalse(r.ok);
  });
});

describe("knowsGift", () => {
  it("case-insensitive name match", () => {
    const char = makeChar({ gifts: ["mother's touch"] });
    assert(knowsGift(char, "mothers-touch"));
  });

  it("false for unknown slug", () => {
    const char = makeChar({ gifts: ["Mother's Touch"] });
    assertFalse(knowsGift(char, "bogus-slug"));
  });

  it("false when not learned", () => {
    const char = makeChar({ gifts: [] });
    assertFalse(knowsGift(char, "mothers-touch"));
  });
});
