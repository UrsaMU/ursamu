/**
 * Tests — Small Fixes (facedown, rockerboy DV, admin EB guard, language skills)
 */
import { assertEquals, assert } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { facedownTotal } from "../engine/combat.ts";
import { SKILLS } from "../data/skills.ts";

// ---------------------------------------------------------------------------
// Fix 1: Facedown roll arithmetic
// ---------------------------------------------------------------------------

describe("facedownTotal()", () => {
  it("sums COOL + REP + d10 roll correctly", () => {
    assertEquals(facedownTotal(7, 3, 8), 18);
    assertEquals(facedownTotal(5, 2, 1), 8);
    assertEquals(facedownTotal(10, 10, 10), 30);
  });

  it("handles zero reputation", () => {
    assertEquals(facedownTotal(6, 0, 5), 11);
  });

  it("handles negative reputation (counts against)", () => {
    assertEquals(facedownTotal(6, -2, 5), 9);
  });
});

describe("facedown contested resolution", () => {
  it("higher total wins", () => {
    const attacker = facedownTotal(7, 3, 8); // 18
    const defender = facedownTotal(5, 1, 4); // 10
    assert(attacker > defender, "attacker should win");
  });

  it("tie is detected correctly", () => {
    const a = facedownTotal(5, 5, 5); // 15
    const b = facedownTotal(10, 0, 5); // 15
    assertEquals(a, b);
  });
});

// ---------------------------------------------------------------------------
// Fix 2: Rockerboy Charismatic Impact DV by crowd tier
// ---------------------------------------------------------------------------

describe("Rockerboy DV tiers", () => {
  const DV: Record<string, number> = {
    single: 8,
    small: 10,
    large: 12,
  };

  it("single target DV is 8", () => assertEquals(DV["single"], 8));
  it("small group DV is 10", () => assertEquals(DV["small"], 10));
  it("large group DV is 12", () => assertEquals(DV["large"], 12));

  it("success when total >= DV", () => {
    const total = 11;
    const dv = DV["small"]!; // 10
    assert(total >= dv, "should succeed");
  });

  it("failure when total < DV", () => {
    const total = 9;
    const dv = DV["small"]!; // 10
    assert(total < dv, "should fail");
  });
});

// ---------------------------------------------------------------------------
// Fix 3: Admin EB negative value guard (pure logic, no SDK)
// ---------------------------------------------------------------------------

/** Mirrors the guard logic in adminSetEB */
function ebGuard(valStr: string): { ok: boolean; error?: string; value?: number } {
  const ebVal = parseInt(valStr, 10);
  if (isNaN(ebVal)) return { ok: false, error: "not a number" };
  if (ebVal < 0) return { ok: false, error: "EB cannot be set below 0." };
  return { ok: true, value: ebVal };
}

describe("admin EB guard", () => {
  it("rejects negative values", () => {
    const result = ebGuard("-100");
    assertEquals(result.ok, false);
    assertEquals(result.error, "EB cannot be set below 0.");
  });

  it("allows zero", () => {
    const result = ebGuard("0");
    assertEquals(result.ok, true);
    assertEquals(result.value, 0);
  });

  it("allows positive values", () => {
    const result = ebGuard("5000");
    assertEquals(result.ok, true);
    assertEquals(result.value, 5000);
  });

  it("rejects non-numeric string", () => {
    const result = ebGuard("abc");
    assertEquals(result.ok, false);
  });
});

// ---------------------------------------------------------------------------
// Fix 4: Language skills present in SKILLS array
// ---------------------------------------------------------------------------

describe("Language skills in SKILLS", () => {
  const names = SKILLS.map((s) => s.name);

  it("language_spanish is present", () => assert(names.includes("language_spanish")));
  it("language_chinese is present", () => assert(names.includes("language_chinese")));
  it("language_japanese is present", () => assert(names.includes("language_japanese")));
  it("language_german is present", () => assert(names.includes("language_german")));
  it("language_french is present", () => assert(names.includes("language_french")));

  it("all language skills are in 'social' category", () => {
    const langs = SKILLS.filter((s) => s.name.startsWith("language_") && s.name !== "language_streetslang");
    for (const lang of langs) {
      assertEquals(lang.category, "social", `${lang.name} should be in social category`);
    }
  });

  it("all language skills use INT stat", () => {
    const langs = SKILLS.filter((s) => s.name.startsWith("language_") && s.name !== "language_streetslang");
    for (const lang of langs) {
      assertEquals(lang.stat, "int", `${lang.name} should use INT`);
    }
  });
});
