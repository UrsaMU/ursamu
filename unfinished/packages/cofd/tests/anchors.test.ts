import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  COFD_VICE_NAMES,
  COFD_VICES,
  COFD_VIRTUE_NAMES,
  COFD_VIRTUES,
  findVice,
  findVirtue,
} from "../src/dictionary/anchors.ts";
import { validateTraitValue } from "../src/stats/validate.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("CoFD Virtue / Vice anchor catalog", OPTS, () => {
  it("loads the four canonical Virtues with description and trigger", () => {
    assertEquals(COFD_VIRTUE_NAMES, ["Competitive", "Generous", "Just", "Loyal"]);
    for (const v of COFD_VIRTUES) {
      if (!v.description) throw new Error(`Virtue '${v.name}' is missing description.`);
      if (!v.willpowerTrigger) throw new Error(`Virtue '${v.name}' is missing willpowerTrigger.`);
    }
  });

  it("loads the four canonical Vices with description and trigger", () => {
    assertEquals(COFD_VICE_NAMES, ["Ambitious", "Arrogant", "Competitive", "Greedy"]);
    for (const v of COFD_VICES) {
      if (!v.description) throw new Error(`Vice '${v.name}' is missing description.`);
      if (!v.willpowerTrigger) throw new Error(`Vice '${v.name}' is missing willpowerTrigger.`);
    }
  });

  it("looks up Virtues case-insensitively and returns canonical name", () => {
    assertEquals(findVirtue("just")?.name, "Just");
    assertEquals(findVirtue("  LOYAL  ")?.name, "Loyal");
    assertEquals(findVirtue("Hopeful"), null);
  });

  it("looks up Vices case-insensitively and returns canonical name", () => {
    assertEquals(findVice("greedy")?.name, "Greedy");
    assertEquals(findVice("  ambitious  ")?.name, "Ambitious");
    assertEquals(findVice("Lustful"), null);
  });
});

describe("validateTraitValue normalizes and rejects bad anchors", OPTS, () => {
  it("normalizes lowercase Virtue input to canonical case", () => {
    assertEquals(validateTraitValue("virtue", "just"), "Just");
    assertEquals(validateTraitValue("virtue", "  COMPETITIVE  "), "Competitive");
  });

  it("normalizes lowercase Vice input to canonical case", () => {
    assertEquals(validateTraitValue("vice", "greedy"), "Greedy");
    assertEquals(validateTraitValue("vice", "Arrogant"), "Arrogant");
  });

  it("rejects an off-catalog Virtue with a listing of valid options", () => {
    const err = assertThrows(
      () => validateTraitValue("virtue", "Hopeful"),
      Error,
    );
    if (!err.message.includes("Hopeful")) throw new Error("Error should name the invalid input.");
    if (!err.message.includes("Competitive, Generous, Just, Loyal")) {
      throw new Error("Error should list canonical Virtues.");
    }
  });

  it("rejects an off-catalog Vice with a listing of valid options", () => {
    const err = assertThrows(
      () => validateTraitValue("vice", "Cruel"),
      Error,
    );
    if (!err.message.includes("Cruel")) throw new Error("Error should name the invalid input.");
    if (!err.message.includes("Ambitious, Arrogant, Competitive, Greedy")) {
      throw new Error("Error should list canonical Vices.");
    }
  });

  it("still allows concept to be free text", () => {
    assertEquals(validateTraitValue("concept", "Modern Knight"), "Modern Knight");
  });
});
