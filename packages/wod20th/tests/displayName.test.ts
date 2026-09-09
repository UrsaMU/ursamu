import { assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { shiftedDisplayName } from "../core/displayName.ts";
import type { IWoDChar } from "../core/types.ts";

const base: IWoDChar = {
  id: "c", playerId: "p", splat: "wta", status: "approved", chargenStep: 6,
  concept: "", attributePriority: ["", "", ""], attributes: {},
  attributeSpecialties: {}, abilityPriority: ["", "", ""], abilities: {},
  abilitySpecialties: {}, backgrounds: {}, willpower: 5,
  freebiesRemaining: 0, freebiesLog: [], xpTotal: 0, xpSpent: 0,
  notes: [], staffNotes: "", statLog: [], createdAt: 0, updatedAt: 0,
};

describe("shiftedDisplayName", () => {
  it("returns fallback when char is null/undefined", () => {
    assertEquals(shiftedDisplayName(null, "Storms"), "Storms");
    assertEquals(shiftedDisplayName(undefined, "Storms"), "Storms");
  });

  it("returns fallback when char has no deedName", () => {
    assertEquals(shiftedDisplayName(base, "Storms"), "Storms");
  });

  it("returns fallback when in homid even with deedName set", () => {
    const c = { ...base, deedName: "Lightning-Maul", currentForm: "homid" as const };
    assertEquals(shiftedDisplayName(c, "Storms"), "Storms");
  });

  it("returns deedName when in glabro/crinos/hispo/lupus", () => {
    for (const form of ["glabro", "crinos", "hispo", "lupus"] as const) {
      const c = { ...base, deedName: "Lightning-Maul", currentForm: form };
      assertEquals(shiftedDisplayName(c, "Storms"), "Lightning-Maul");
    }
  });

  it("returns fallback for non-wta even with deedName + non-homid form", () => {
    const c = {
      ...base, splat: "mortal" as const, deedName: "Should-Not-Show",
      currentForm: "crinos" as const,
    };
    assertEquals(shiftedDisplayName(c, "Cassidy"), "Cassidy");
  });

  it("treats missing currentForm as homid (breed-default fallback)", () => {
    const c = { ...base, deedName: "Lightning-Maul" };
    assertEquals(shiftedDisplayName(c, "Storms"), "Storms");
  });
});
