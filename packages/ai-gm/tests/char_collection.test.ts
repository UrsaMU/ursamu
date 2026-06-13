// Tests for charCollection gap closure:
//   - +gm/config/chars validation (isValidCollectionName)
//   - formatCharactersFull / formatCharactersOneLiner generic fallback
//   - formatCharactersFull SR4 and Urban Shadows branches (regression)

import {
  assertEquals,
  assertNotMatch,
  assertStringIncludes,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";

// ─── isValidCollectionName (extracted for unit testing) ───────────────────────
// Mirror the logic from commands.ts — kept here so tests don't import the full
// command file (which has side-effects via addCmd).

function isValidCollectionName(s: string): boolean {
  return /^[a-z0-9]+(\.[a-z0-9]+)*$/.test(s);
}

// ─── Formatters under test ────────────────────────────────────────────────────

import {
  formatCharactersFull,
  formatCharactersOneLiner,
} from "../context/compressor.ts";
import type { ICharSheet } from "../context/loader.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function sr4Char(overrides: Partial<ICharSheet> = {}): ICharSheet {
  return {
    id: "sr1",
    playerId: "p1",
    name: "Ghost",
    metatype: "Human",
    chargenState: "approved",
    attrs: {
      Body: 5,
      Agility: 6,
      Reaction: 5,
      Strength: 4,
      Charisma: 2,
      Intuition: 4,
      Logic: 3,
      Willpower: 3,
      Edge: 4,
    },
    skills: {
      Firearms: { rating: 6 },
      Stealth: { rating: 5, spec: "Urban" },
      Perception: { rating: 4 },
    },
    physicalDmg: 2,
    stunDmg: 1,
    karmaAvailable: 10,
    ...overrides,
  };
}

function urbanChar(overrides: Partial<ICharSheet> = {}): ICharSheet {
  return {
    id: "us1",
    playerId: "p2",
    name: "Vex",
    status: "approved",
    playbookId: "The Wolf",
    stats: { blood: 1, heart: -1, mind: 2, spirit: 0 },
    harm: { boxes: [true, true, false, false, false], armor: 1 },
    corruption: { marks: 2 },
    circleStatus: { mortalis: 1, night: 2, power: -1, wild: 0 },
    debts: [{ direction: "owes", to: "Nyx", description: "a favour" }],
    selectedMoves: ["Pack Mentality"],
    xp: 3,
    ...overrides,
  };
}

function genericChar(overrides: Partial<ICharSheet> = {}): ICharSheet {
  return {
    id: "g1",
    playerId: "p3",
    name: "Aria",
    status: "approved",
    data: { strength: 4, agility: 3, level: 5 },
    ...overrides,
  };
}

// ─── isValidCollectionName ────────────────────────────────────────────────────

describe("isValidCollectionName", () => {
  it("accepts single segment", () =>
    assertEquals(isValidCollectionName("server"), true));
  it("accepts dot-separated segments", () =>
    assertEquals(isValidCollectionName("shadowrun.chars"), true));
  it("accepts three segments", () =>
    assertEquals(isValidCollectionName("server.gm.custom"), true));
  it("rejects empty string", () =>
    assertEquals(isValidCollectionName(""), false));
  it("rejects uppercase letters", () =>
    assertEquals(isValidCollectionName("Shadowrun.Chars"), false));
  it("rejects leading dot", () =>
    assertEquals(isValidCollectionName(".chars"), false));
  it("rejects trailing dot", () =>
    assertEquals(isValidCollectionName("server."), false));
  it("rejects spaces", () =>
    assertEquals(isValidCollectionName("shadow run"), false));
  it("rejects double dots", () =>
    assertEquals(isValidCollectionName("server..chars"), false));
  it("rejects special characters", () =>
    assertEquals(isValidCollectionName("server/chars"), false));
});

// ─── formatCharactersFull — SR4 ───────────────────────────────────────────────

describe("formatCharactersFull — SR4 chars", () => {
  it("renders name and metatype", () => {
    const out = formatCharactersFull([sr4Char()], ["p1"]);
    assertStringIncludes(out, "Ghost");
    assertStringIncludes(out, "Human");
  });

  it("renders attribute block", () => {
    const out = formatCharactersFull([sr4Char()], ["p1"]);
    assertStringIncludes(out, "Body 5");
    assertStringIncludes(out, "Agi 6");
    assertStringIncludes(out, "Edge 4");
  });

  it("renders condition monitors with correct maxes", () => {
    // Body 5 → ceil(5/2)+8 = 11; Willpower 3 → ceil(3/2)+8 = 10
    const out = formatCharactersFull([sr4Char()], ["p1"]);
    assertStringIncludes(out, "Physical: 2/11");
    assertStringIncludes(out, "Stun: 1/10");
  });

  it("excludes player not in room", () => {
    const out = formatCharactersFull([sr4Char()], ["other-player"]);
    assertEquals(out, "None.");
  });
});

// ─── formatCharactersFull — Urban Shadows ────────────────────────────────────

describe("formatCharactersFull — Urban Shadows chars", () => {
  it("renders playbook and stats", () => {
    const out = formatCharactersFull([urbanChar()], ["p2"]);
    assertStringIncludes(out, "Vex");
    assertStringIncludes(out, "The Wolf");
    assertStringIncludes(out, "blood 1");
  });

  it("renders harm count", () => {
    const out = formatCharactersFull([urbanChar()], ["p2"]);
    assertStringIncludes(out, "Harm: 2/5");
  });

  it("does not crash if attrs field is absent", () => {
    // Regression: Urban Shadows chars must not hit SR4 branch
    const out = formatCharactersFull([urbanChar()], ["p2"]);
    assertNotMatch(out, /Body \d/);
  });
});

// ─── formatCharactersFull — generic fallback ─────────────────────────────────

describe("formatCharactersFull — generic fallback", () => {
  it("renders character name", () => {
    const out = formatCharactersFull([genericChar()], ["p3"]);
    assertStringIncludes(out, "Aria");
  });

  it("renders data fields", () => {
    const out = formatCharactersFull([genericChar()], ["p3"]);
    assertStringIncludes(out, "strength");
    assertStringIncludes(out, "4");
  });

  it("does not crash — no harm, no attrs", () => {
    const bare: ICharSheet = {
      id: "b1",
      playerId: "p4",
      name: "Bare",
      status: "approved",
    };
    const out = formatCharactersFull([bare], ["p4"]);
    assertStringIncludes(out, "Bare");
  });

  it("excludes infra fields (id, playerId, location)", () => {
    const out = formatCharactersFull([genericChar()], ["p3"]);
    assertNotMatch(out, /\bid:/);
    assertNotMatch(out, /\bplayerId:/);
  });
});

// ─── Security: isUrbanShadowsChar false-positive (Finding 5) ─────────────────

describe("isUrbanShadowsChar false-positive — no crash", () => {
  it("char with harm.boxes but no corruption falls through to generic formatter", () => {
    const trap: ICharSheet = {
      id: "trap1",
      playerId: "p99",
      name: "TrapChar",
      status: "approved",
      harm: { boxes: [false, false, false, false, false], armor: 0 },
      // intentionally missing: corruption, stats, circleStatus, debts, selectedMoves
    };
    // Pre-patch this would throw: TypeError: Cannot read properties of undefined (reading 'marks')
    const out = formatCharactersFull([trap], ["p99"]);
    assertStringIncludes(out, "TrapChar");
    // Must NOT contain Urban Shadows field labels
    assertNotMatch(out, /Corruption/);
    assertNotMatch(out, /Circles:/);
  });

  it("char with harm.boxes but no stats falls through to generic formatter", () => {
    const trap: ICharSheet = {
      id: "trap2",
      playerId: "p98",
      name: "StatlessTrap",
      harm: { boxes: [], armor: 0 },
      corruption: { marks: 1 },
      // missing stats, circleStatus, debts, selectedMoves
    };
    const out = formatCharactersFull([trap], ["p98"]);
    assertStringIncludes(out, "StatlessTrap");
    assertNotMatch(out, /blood/);
  });
});

// ─── formatCharactersOneLiner ─────────────────────────────────────────────────

describe("formatCharactersOneLiner", () => {
  it("SR4 — renders condition monitor oneliner", () => {
    const out = formatCharactersOneLiner([sr4Char()]);
    assertStringIncludes(out, "Ghost");
    assertStringIncludes(out, "phys");
    assertStringIncludes(out, "stun");
  });

  it("Urban Shadows — renders harm/corruption oneliner", () => {
    const out = formatCharactersOneLiner([urbanChar()]);
    assertStringIncludes(out, "Vex");
    assertStringIncludes(out, "harm 2/5");
  });

  it("generic — renders name and status", () => {
    const out = formatCharactersOneLiner([genericChar()]);
    assertStringIncludes(out, "Aria");
    assertStringIncludes(out, "approved");
  });

  it("returns None. for empty list", () => {
    assertEquals(formatCharactersOneLiner([]), "None.");
  });
});
