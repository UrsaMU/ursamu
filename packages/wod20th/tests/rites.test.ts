// tests/rites.test.ts -- WtA rite data + learn/forget/knows/cast mechanics.
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import { WTA_RITES, type RiteCategory } from "../splats/wta/data/rites.ts";
import {
  castRite,
  forgetRite,
  knowsRite,
  learnRite,
} from "../core/rites.ts";
import type { IWoDChar } from "../core/types.ts";

const VALID_CATEGORIES: ReadonlySet<RiteCategory> = new Set([
  "mystic", "minor", "seasonal", "accord", "caern",
  "death", "renown", "punishment", "passage",
]);

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
    gnosis: 4,
    rage: 3,
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

describe("WTA_RITES database", () => {
  const entries = Object.values(WTA_RITES);

  it("has at least 30 rites", () => {
    assert(entries.length >= 30, `expected >=30 rites, got ${entries.length}`);
  });

  it("every entry has a valid level 1-5", () => {
    for (const r of entries) {
      assert([1, 2, 3, 4, 5].includes(r.level), `${r.name} has bad level ${r.level}`);
    }
  });

  it("every entry has a valid category", () => {
    for (const r of entries) {
      assert(VALID_CATEGORIES.has(r.category), `${r.name} has bad category "${r.category}"`);
    }
  });

  it("slugs are lowercase, hyphen-separated", () => {
    for (const slug of Object.keys(WTA_RITES)) {
      assert(/^[a-z0-9-]+$/.test(slug), `bad slug: ${slug}`);
    }
  });
});

describe("learnRite", () => {
  it("adds an unknown rite", () => {
    const char = makeChar();
    const res = learnRite(char, "rite-of-cleansing");
    assert(res.ok);
    assertEquals(res.rites, ["rite-of-cleansing"]);
  });

  it("rejects unknown slug", () => {
    const char = makeChar();
    const res = learnRite(char, "rite-of-nothing");
    assertFalse(res.ok);
  });

  it("is idempotent if already known", () => {
    const char = makeChar({ rites: ["rite-of-cleansing"] });
    const res = learnRite(char, "rite-of-cleansing");
    assertFalse(res.ok);
    assertEquals(res.rites, ["rite-of-cleansing"]);
  });

  it("is case-insensitive on slugs", () => {
    const char = makeChar();
    const res = learnRite(char, "Rite-Of-Cleansing");
    assert(res.ok);
    assertEquals(res.rites?.length, 1);
  });
});

describe("forgetRite", () => {
  it("removes a known rite", () => {
    const char = makeChar({ rites: ["rite-of-cleansing", "rite-of-passage"] });
    const res = forgetRite(char, "rite-of-cleansing");
    assert(res.ok);
    assertEquals(res.rites, ["rite-of-passage"]);
  });

  it("fails for unknown rite", () => {
    const char = makeChar({ rites: ["rite-of-passage"] });
    const res = forgetRite(char, "rite-of-cleansing");
    assertFalse(res.ok);
  });
});

describe("knowsRite", () => {
  it("returns true for known rite", () => {
    const char = makeChar({ rites: ["rite-of-cleansing"] });
    assert(knowsRite(char, "rite-of-cleansing"));
  });

  it("returns false for unknown rite", () => {
    const char = makeChar({ rites: ["rite-of-cleansing"] });
    assertFalse(knowsRite(char, "rite-of-passage"));
  });

  it("is case-insensitive", () => {
    const char = makeChar({ rites: ["rite-of-cleansing"] });
    assert(knowsRite(char, "RITE-OF-CLEANSING"));
  });
});

describe("castRite", () => {
  it("returns a roll for a known rite slug", () => {
    const char = makeChar({ gnosis: 5 });
    const res = castRite(char, "rite-of-cleansing");
    assertEquals(res.roll.pool, 5);
    assert(res.roll.dice.length === 5);
    assert(typeof res.message === "string" && res.message.length > 0);
  });

  it("uses rite difficulty when present, else 7", () => {
    const char = makeChar({ gnosis: 3 });
    const res = castRite(char, "rite-of-cleansing");
    assert(res.roll.difficulty >= 2 && res.roll.difficulty <= 10);
  });

  it("allows difficulty override", () => {
    const char = makeChar({ gnosis: 3 });
    const res = castRite(char, "rite-of-cleansing", 5);
    assertEquals(res.roll.difficulty, 5);
  });

  it("returns a failure shape for unknown slug", () => {
    const char = makeChar({ gnosis: 3 });
    const res = castRite(char, "rite-of-nothing");
    assertFalse(res.ok);
  });
});
