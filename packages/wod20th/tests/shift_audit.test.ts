// tests/shift_audit.test.ts -- Security/exploit audit for +shift command surface.
//
// Each test is framed as an OWASP-style exploit vector. Where the source was
// already hardened, the test acts as a regression guard. Where a vulnerability
// existed (E-6: shifting out of Crinos during frenzy), the source was patched
// in this audit and the test now asserts the patched behavior.
import { assert, assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import { applyFormModifiers, FORM_LIST, shiftTo } from "../core/forms.ts";
import type { IWoDChar } from "../core/types.ts";

function mkChar(overrides: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "c1",
    playerId: "p1",
    splat: "wta",
    status: "approved",
    chargenStep: 6,
    concept: "test",
    attributePriority: ["", "", ""],
    attributes: {},
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {},
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 6,
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: 0,
    updatedAt: 0,
    breed: "homid",
    ...overrides,
  };
}

describe("+shift audit (exploit vectors)", () => {
  it("E-1: non-WtA characters cannot shift (splat gate)", () => {
    const c = mkChar({ splat: "mortal" });
    const r = shiftTo(c, "crinos");
    assertEquals(r.ok, false);
    assert(r.message.includes("Garou"));
  });

  it("E-2a: unknown form names rejected (shell-injection-shaped argument)", () => {
    const c = mkChar();
    const r = shiftTo(c, "Crinos; rm -rf /");
    assertEquals(r.ok, false);
    assert(r.message.toLowerCase().includes("unknown form"));
  });

  it("E-2b: trailing whitespace tolerated (defensive trim)", () => {
    const c = mkChar({ currentForm: "homid" });
    const r = shiftTo(c, "  crinos  ");
    assertEquals(r.ok, true);
  });

  it("E-2c: empty / whitespace-only argument rejected", () => {
    const c = mkChar();
    assertEquals(shiftTo(c, "").ok, false);
    assertEquals(shiftTo(c, "   ").ok, false);
  });

  it("E-2d: prototype/keyword tokens rejected", () => {
    const c = mkChar();
    for (const bogus of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      const r = shiftTo(c, bogus);
      assertEquals(r.ok, false, `should reject ${bogus}`);
    }
  });

  it("E-3: form modifiers cannot push attributes above 10 (clamp high)", () => {
    // Strength 10 (9 dots over base 1) + Crinos +4 would be 14 without clamp.
    const c = mkChar({
      currentForm: "crinos",
      attributes: { Strength: 9, Dexterity: 9, Stamina: 9, Manipulation: 9, Appearance: 9 },
    });
    const eff = applyFormModifiers(c);
    assert(eff.Strength <= 10, `Strength clamp: ${eff.Strength}`);
    assert(eff.Dexterity <= 10);
    assert(eff.Stamina <= 10);
  });

  it("E-4: form modifiers cannot push attributes below 1 (clamp low)", () => {
    // Manipulation 1 (0 dots over base 1) + Crinos -3 would be -2 without clamp.
    const c = mkChar({
      currentForm: "crinos",
      attributes: { Strength: 0, Dexterity: 0, Stamina: 0, Manipulation: 0, Appearance: 0 },
    });
    const eff = applyFormModifiers(c);
    assert(eff.Manipulation >= 1, `Manipulation clamp: ${eff.Manipulation}`);
    assert(eff.Strength >= 1);
    // Appearance forced to 0 in Crinos -- canonical, not a clamp violation.
    assertEquals(eff.Appearance, 0);
  });

  it("E-5: every canonical form is reachable from homid (sanity guard for /who exposure)", () => {
    // The /who switch is staff-locked in commands/shift.ts via flag check; the
    // pure logic here cannot be exercised without that gate. Regression-guard:
    // confirm shiftTo accepts each canonical form so the gate is the only path
    // that decides exposure (no silent fallthrough to "anyone can see").
    for (const f of FORM_LIST) {
      if (f === "homid") continue;
      const r = shiftTo(mkChar({ currentForm: "homid" }), f);
      assertEquals(r.ok, true, `homid -> ${f} should succeed`);
    }
  });

  it("E-6: frenzied Garou cannot shift OUT of Crinos", () => {
    // Indefinite berserk frenzy in Crinos -- attempts to exit must fail.
    const c = mkChar({
      currentForm: "crinos",
      frenzyState: "berserk",
      frenzyUntil: 0, // indefinite
    });
    for (const target of ["homid", "glabro", "hispo", "lupus"] as const) {
      const r = shiftTo(c, target);
      assertEquals(r.ok, false, `frenzy should block crinos -> ${target}`);
      assert(r.message.toLowerCase().includes("frenzy"));
    }
  });

  it("E-6b: frenzied Garou can still shift INTO Crinos from another form", () => {
    const c = mkChar({
      currentForm: "homid",
      frenzyState: "berserk",
      frenzyUntil: 0,
    });
    const r = shiftTo(c, "crinos");
    assertEquals(r.ok, true);
  });

  it("E-6c: expired frenzy does NOT block shifting out of Crinos", () => {
    const past = 1000;
    const c = mkChar({
      currentForm: "crinos",
      frenzyState: "berserk",
      frenzyUntil: past, // expired
    });
    const r = shiftTo(c, "homid", past + 1);
    assertEquals(r.ok, true);
  });
});
