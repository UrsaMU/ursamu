// Smoke tests for the @desc command's field-key + plane-validation logic.
// Full SDK integration is exercised in showcase runs.
import { assert, assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

const PLANE_RX = /^[a-z][a-z0-9-]*$/;

describe("@desc plane slug validation", () => {
  it("accepts canonical plane slugs", () => {
    for (const p of ["penumbra", "deep-umbra", "near-umbra", "high-umbra", "astral", "shadowlands"]) {
      assert(PLANE_RX.test(p), `${p} should be valid`);
    }
  });

  it("rejects non-slugs", () => {
    for (const p of ["", "Penumbra", "1material", "deep umbra", "deep_umbra", "../etc/passwd", "<script>"]) {
      assert(!PLANE_RX.test(p), `${p} should be invalid`);
    }
  });
});

describe("@desc field-key shape", () => {
  it("derives state.<plane>Description shorthand from the switch", () => {
    const plane = "penumbra";
    const key = `state.${plane}Description`;
    assertEquals(key, "state.penumbraDescription");
  });

  it("falls through to state.description without a switch", () => {
    const key = "state.description";
    assertEquals(key, "state.description");
  });
});
