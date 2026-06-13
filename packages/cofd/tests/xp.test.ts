// Tests for the M4 Beats/XP economy: cost lookup, conversion, and spend.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  addBeats,
  categorizeTrait,
  convertBeatsToXp,
  getCost,
  spendXp,
} from "../src/xp/index.ts";
import { defaultSheet, setTrait } from "../src/stats/index.ts";

describe("XP cost lookup", () => {
  it("getCost('attribute', 2) returns 4 XP per dot, non-arcane", () => {
    const c = getCost("attribute", 2);
    assertEquals(c.cost, 4);
    assertEquals(c.arcane, false);
  });

  it("getCost('specialty', 0) returns the flat 1 XP cost", () => {
    const c = getCost("specialty", 0);
    assertEquals(c.cost, 1);
    assertEquals(c.arcane, false);
  });
});

describe("Trait categorization", () => {
  it("categorizes 'strength' as an attribute", () => {
    const s = defaultSheet();
    assertEquals(categorizeTrait("strength", s), "attribute");
  });

  it("categorizes 'athletics' as a skill", () => {
    const s = defaultSheet();
    assertEquals(categorizeTrait("athletics", s), "skill");
  });

  it("returns null for an unknown trait", () => {
    const s = defaultSheet();
    assertEquals(categorizeTrait("xyzzy", s), null);
  });
});

describe("Beat conversion", () => {
  it("convertBeatsToXp(7) yields 1 XP with remainder 2", () => {
    const r = convertBeatsToXp(7);
    assertEquals(r.xp, 1);
    assertEquals(r.remainder, 2);
  });

  it("addBeats(sheet, 5, false) rolls 5 Beats over into 1 Experience", () => {
    const s = defaultSheet();
    const out = addBeats(s, 5, false);
    assertEquals(out.beats, 0);
    assertEquals(out.experience, 1);
    assertEquals(out.arcaneBeats, 0);
    assertEquals(out.arcaneExperience, 0);
  });

  it("addBeats(sheet, 3, true) only touches the arcane Beat track", () => {
    const s = defaultSheet();
    const out = addBeats(s, 3, true);
    assertEquals(out.arcaneBeats, 3);
    assertEquals(out.arcaneExperience, 0);
    assertEquals(out.beats, 0);
    assertEquals(out.experience, 0);
  });
});

describe("XP spend", () => {
  it("raising Strength 2 -> 3 with 4 XP banked succeeds at cost 4", () => {
    let s = defaultSheet();
    s = setTrait(s, "strength", 2);
    s.experience = 4;

    const r = spendXp(s, "strength", 3);
    assert(r.sheet, `expected success, got: ${r.error}`);
    assertEquals(r.cost, 4);
    assertEquals(r.arcane, false);
    assertEquals(r.sheet!.attributes.strength, 3);
    assertEquals(r.sheet!.experience, 0);
  });

  it("raising Strength 2 -> 3 with only 2 XP banked errors with 'insufficient'", () => {
    let s = defaultSheet();
    s = setTrait(s, "strength", 2);
    s.experience = 2;

    const r = spendXp(s, "strength", 3);
    assert(!r.sheet, "expected failure");
    assert(r.error, "expected an error message");
    assertStringIncludes(r.error!.toLowerCase(), "insufficient");
  });

  it("attempting to spend on an unknown trait errors with 'unknown'", () => {
    const s = defaultSheet();
    const r = spendXp(s, "xyzzy", 1);
    assert(!r.sheet, "expected failure");
    assert(r.error, "expected an error message");
    assertStringIncludes(r.error!.toLowerCase(), "unknown");
  });
});
