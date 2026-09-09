// tests/forms.test.ts -- Unit tests for WtA form-shifting mechanics.
import { assertEquals, assert } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import {
  FORM_LIST,
  FORM_MODIFIERS,
  FORM_ATTRS,
  defaultFormForBreed,
  applyFormModifiers,
  shiftTo,
} from "../core/forms.ts";
import type { IWoDChar } from "../core/types.ts";

function baseChar(overrides: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "t",
    playerId: "p",
    splat: "wta",
    status: "draft",
    chargenStep: 6,
    concept: "",
    attributePriority: ["", "", ""],
    attributes: {},
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {},
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 3,
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

describe("FORM_MODIFIERS table", () => {
  it("defines all five forms", () => {
    for (const f of FORM_LIST) assert(FORM_MODIFIERS[f], `missing form: ${f}`);
    assertEquals(FORM_LIST.length, 5);
  });

  it("covers all five form attributes for every form", () => {
    for (const f of FORM_LIST) {
      for (const a of FORM_ATTRS) {
        assert(typeof FORM_MODIFIERS[f][a] === "number", `${f}.${a} missing`);
      }
    }
  });

  it("matches canonical M20 deltas", () => {
    assertEquals(FORM_MODIFIERS.homid.Strength, 0);
    assertEquals(FORM_MODIFIERS.glabro.Strength, 2);
    assertEquals(FORM_MODIFIERS.crinos.Strength, 4);
    assertEquals(FORM_MODIFIERS.hispo.Strength, 3);
    assertEquals(FORM_MODIFIERS.lupus.Strength, 1);
    assertEquals(FORM_MODIFIERS.crinos.Manipulation, -3);
    assertEquals(FORM_MODIFIERS.glabro.Appearance, -1);
  });
});

describe("defaultFormForBreed", () => {
  it("homid -> homid", () => assertEquals(defaultFormForBreed("homid"), "homid"));
  it("lupus -> lupus", () => assertEquals(defaultFormForBreed("lupus"), "lupus"));
  it("metis -> crinos", () => assertEquals(defaultFormForBreed("metis"), "crinos"));
  it("unknown -> homid fallback", () => assertEquals(defaultFormForBreed("blorp"), "homid"));
  it("undefined -> homid fallback", () => assertEquals(defaultFormForBreed(undefined), "homid"));
});

describe("applyFormModifiers", () => {
  it("homid form leaves stats unchanged", () => {
    const c = baseChar({
      breed: "homid",
      currentForm: "homid",
      attributes: { Strength: 2, Dexterity: 2, Stamina: 2, Manipulation: 2, Appearance: 2 },
    });
    const out = applyFormModifiers(c);
    // Permanent storage = extras above base 1; attributes-with-base = 1+stored.
    assertEquals(out.Strength,  3);
    assertEquals(out.Dexterity, 3);
    assertEquals(out.Appearance, 3);
  });

  it("crinos applies +4 Str, -3 Man, App=0", () => {
    const c = baseChar({
      breed: "homid",
      currentForm: "crinos",
      attributes: { Strength: 2, Manipulation: 2, Appearance: 3 },
    });
    const out = applyFormModifiers(c);
    assertEquals(out.Strength, 7);       // 1+2 +4
    assertEquals(out.Manipulation, 1);   // 1+2 -3 = 0 -> clamp 1
    assertEquals(out.Appearance, 0);     // forced zero in war/wolf
  });

  it("clamps high values at 10", () => {
    const c = baseChar({
      breed: "homid",
      currentForm: "crinos",
      attributes: { Strength: 9 }, // 1+9 = 10, +4 = 14 -> clamp 10
    });
    const out = applyFormModifiers(c);
    assertEquals(out.Strength, 10);
  });

  it("clamps low values at 1 (non-App)", () => {
    const c = baseChar({
      breed: "homid",
      currentForm: "crinos",
      attributes: { Manipulation: 0 }, // 1+0 -3 = -2 -> clamp 1
    });
    const out = applyFormModifiers(c);
    assertEquals(out.Manipulation, 1);
  });

  it("does not mutate the source", () => {
    const attrs = { Strength: 2 };
    const c = baseChar({ breed: "homid", currentForm: "crinos", attributes: attrs });
    applyFormModifiers(c);
    assertEquals(attrs.Strength, 2);
  });

  it("defaults to breed form when currentForm is unset", () => {
    const c = baseChar({ breed: "lupus", attributes: { Strength: 2 } });
    const out = applyFormModifiers(c);
    assertEquals(out.Strength, 4); // 1+2 +1 lupus
  });
});

describe("shiftTo", () => {
  it("rejects non-wta splats", () => {
    const c = baseChar({ splat: "mortal" });
    const r = shiftTo(c, "crinos");
    assertEquals(r.ok, false);
  });

  it("rejects unknown form names", () => {
    const c = baseChar({ breed: "homid", currentForm: "homid" });
    const r = shiftTo(c, "dragon");
    assertEquals(r.ok, false);
  });

  it("rejects shifting to the form you're already in", () => {
    const c = baseChar({ breed: "homid", currentForm: "homid" });
    const r = shiftTo(c, "homid");
    assertEquals(r.ok, false);
  });

  it("accepts a valid cross-form shift", () => {
    const c = baseChar({ breed: "homid", currentForm: "homid" });
    const r = shiftTo(c, "crinos");
    assertEquals(r.ok, true);
  });

  it("is case-insensitive on the target name", () => {
    const c = baseChar({ breed: "homid", currentForm: "homid" });
    const r = shiftTo(c, "CRINOS");
    assertEquals(r.ok, true);
  });
});
