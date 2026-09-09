// tests/regen.test.ts -- Unit tests for WoD20th regeneration helpers.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import { regenTrack, regenChar, defaultRegenPerTick } from "../core/regen.ts";
import type { DamageMark, IWoDChar } from "../core/types.ts";

function pad(track: DamageMark[]): DamageMark[] {
  const out = track.slice();
  while (out.length < 7) out.push("");
  return out;
}

describe("regenTrack", () => {
  it("heals the worst (highest-index) Bashing slot first", () => {
    const track = pad(["B", "B", "B"]);
    const out = regenTrack(track, "B", 1);
    // Index 2 cleared, indices 0/1 still B.
    assertEquals(out[0], "B");
    assertEquals(out[1], "B");
    assertEquals(out[2], "");
  });

  it("leaves lower-severity Bashing alone when healing Lethal", () => {
    const track = pad(["L", "B", "B"]);
    const out = regenTrack(track, "L", 5);
    // Only the lethal slot at index 0 should clear.
    assertEquals(out[0], "");
    assertEquals(out[1], "B");
    assertEquals(out[2], "B");
  });

  it("Bashing heal skips Lethal slots", () => {
    const track = pad(["L", "B", "B"]);
    const out = regenTrack(track, "B", 5);
    // Both B cleared; L remains untouched.
    assertEquals(out[0], "L");
    assertEquals(out[1], "");
    assertEquals(out[2], "");
  });

  it("Aggravated marks are never healed", () => {
    const track = pad(["A", "A", "B"]);
    const out = regenTrack(track, "B", 5);
    const outL = regenTrack(track, "L", 5);
    assertEquals(out.filter((m) => m === "A").length, 2);
    assertEquals(outL.filter((m) => m === "A").length, 2);
  });

  it("does not mutate the input array", () => {
    const track = pad(["B", "B"]);
    const before = track.slice();
    regenTrack(track, "B", 2);
    assertEquals(track, before);
  });

  it("count <= 0 returns a copy unchanged", () => {
    const track = pad(["B"]);
    const out = regenTrack(track, "B", 0);
    assertEquals(out, track);
  });
});

describe("regenChar", () => {
  it("returns a new char with an updated track and leaves the input alone", () => {
    const char = { healthTrack: pad(["B", "B"]) } as IWoDChar;
    const updated = regenChar(char, "B", 1);
    assertEquals(char.healthTrack![1], "B");        // original untouched
    assertEquals(updated.healthTrack![1], "");      // updated healed
    assertStrictEquals(updated === char, false);
  });

  it("returns input when there is no health track", () => {
    const char = {} as IWoDChar;
    const out = regenChar(char, "B", 3);
    assertStrictEquals(out, char);
  });
});

describe("defaultRegenPerTick", () => {
  it("returns 1 for wta", () => {
    assertStrictEquals(defaultRegenPerTick({ splat: "wta" } as IWoDChar), 1);
  });
  it("returns 0 for kinfolk", () => {
    assertStrictEquals(defaultRegenPerTick({ splat: "kinfolk" } as IWoDChar), 0);
  });
  it("returns 0 for mortal", () => {
    assertStrictEquals(defaultRegenPerTick({ splat: "mortal" } as IWoDChar), 0);
  });
});
