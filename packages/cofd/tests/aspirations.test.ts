// Tests for the M5 Aspirations subsystem.

import { assert, assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  addAspiration,
  AspirationCapacityError,
  fulfillAspiration,
  MAX_ASPIRATIONS,
  removeAspiration,
} from "../src/subsystems/aspirations.ts";
import { defaultSheet } from "../src/stats/index.ts";

describe("addAspiration", () => {
  it("adds a long-term aspiration with shortTerm=false", () => {
    const out = addAspiration(defaultSheet(), "Become Prince", false);
    assertEquals(out.aspirations!.length, 1);
    assertEquals(out.aspirations![0].text, "Become Prince");
    assertEquals(out.aspirations![0].shortTerm, false);
  });

  it(`fills capacity at ${MAX_ASPIRATIONS}; a 4th add throws AspirationCapacityError`, () => {
    let s = defaultSheet();
    s = addAspiration(s, "Goal 1", true);
    s = addAspiration(s, "Goal 2", true);
    s = addAspiration(s, "Goal 3", false);
    assertEquals(s.aspirations!.length, MAX_ASPIRATIONS);
    assertThrows(
      () => addAspiration(s, "Goal 4", true),
      AspirationCapacityError,
    );
  });
});

describe("removeAspiration", () => {
  it("removeAspiration(0) drops the first slot", () => {
    let s = defaultSheet();
    s = addAspiration(s, "A", true);
    s = addAspiration(s, "B", true);
    const out = removeAspiration(s, 0);
    assertEquals(out.aspirations!.length, 1);
    assertEquals(out.aspirations![0].text, "B");
  });
});

describe("fulfillAspiration", () => {
  it("fulfillAspiration(0) removes the slot and awards 1 Beat", () => {
    let s = defaultSheet();
    s = addAspiration(s, "A", true);
    const r = fulfillAspiration(s, 0);
    assertEquals(r.beatsAwarded, 1);
    assertEquals(r.sheet.aspirations!.length, 0);
    assertEquals(r.sheet.beats, 1);
  });

  it("fulfillAspiration on an out-of-range index is a no-op", () => {
    const s = defaultSheet();
    const r = fulfillAspiration(s, 7);
    assertEquals(r.beatsAwarded, 0);
    assert(r.sheet === s, "expected the same sheet reference on no-op");
  });
});
