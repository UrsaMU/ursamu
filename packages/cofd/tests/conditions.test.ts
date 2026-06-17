// Tests for the M5 Conditions/Tilts subsystem.

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  addCondition,
  hasCondition,
  lookupCondition,
  removeCondition,
  resolveCondition,
} from "../src/subsystems/conditions.ts";
import { defaultSheet } from "../src/stats/index.ts";

describe("Condition catalog lookup", () => {
  it("lookupCondition('shaken') returns the entry named 'Shaken'", () => {
    const entry = lookupCondition("shaken");
    assert(entry, "expected a catalog entry for shaken");
    assertEquals(entry!.name, "Shaken");
    assertEquals(entry!.category, "condition");
    assertEquals(entry!.beats, 1);
  });

  it("lookupCondition('xyzzy') returns undefined for unknown keys", () => {
    assertEquals(lookupCondition("xyzzy"), undefined);
  });
});

describe("addCondition / hasCondition", () => {
  it("addCondition appends the condition; conditions length becomes 1", () => {
    const s = defaultSheet();
    const out = addCondition(s, "shaken");
    assertEquals((out.conditions ?? []).length, 1);
    assertEquals(out.conditions![0].key, "shaken");
  });

  it("addCondition with the same key does not duplicate (uniqueness by key)", () => {
    let s = defaultSheet();
    s = addCondition(s, "shaken");
    s = addCondition(s, "shaken");
    assertEquals((s.conditions ?? []).length, 1);
  });

  it("hasCondition returns true after adding 'inspired'", () => {
    const s = addCondition(defaultSheet(), "inspired");
    assert(hasCondition(s, "inspired"));
    assert(!hasCondition(s, "shaken"));
  });
});

describe("removeCondition", () => {
  it("removeCondition drops the entry without changing Beats", () => {
    let s = defaultSheet();
    s = addCondition(s, "shaken");
    const beforeBeats = s.beats ?? 0;
    const out = removeCondition(s, "shaken");
    assertEquals((out.conditions ?? []).length, 0);
    assertEquals(out.beats ?? 0, beforeBeats);
  });
});

describe("resolveCondition", () => {
  it("resolves a present condition: empties list and awards 1 Beat", () => {
    let s = defaultSheet();
    s = addCondition(s, "shaken");
    const r = resolveCondition(s, "shaken");
    assertEquals((r.sheet.conditions ?? []).length, 0);
    assertEquals(r.beatsAwarded, 1);
    assertEquals(r.sheet.beats, 1);
    assertEquals(r.arcane, false);
  });

  it("resolving an absent condition is a no-op with beatsAwarded 0", () => {
    const s = defaultSheet();
    const r = resolveCondition(s, "shaken");
    assertEquals(r.beatsAwarded, 0);
    assertEquals((r.sheet.conditions ?? []).length, 0);
  });
});
