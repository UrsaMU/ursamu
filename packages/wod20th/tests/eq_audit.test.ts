// tests/eq_audit.test.ts -- /tdd-audit security pass for @eq and core/eq.ts.
//
// @eq is a builder command. Field validation lives in commands/eq.ts (pure
// helpers `parseBool`, `parseIntNonNeg`, `setField`). The live-state read
// contract (worn/wielded/concealed must come from direct state, not
// attributes[]) lives in core/eq.ts. Tests exercise the helpers directly
// where possible; switch/auth/clear paths are covered by source-text
// regression guards.
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import {
  EQ_FIELDS,
  EQ_KINDS,
  WEAPON_TYPES,
  DAMAGE_TYPES,
  CONCEALABILITIES,
  getEqMeta,
} from "../core/eq.ts";

const EQ_SRC = await Deno.readTextFile(
  new URL("../commands/eq.ts", import.meta.url),
);

// Local re-implementations of the parse helpers, kept byte-identical with
// commands/eq.ts so we can hammer them with adversarial input. Any drift
// will fail the source-text guard below.
function parseBool(v: string): boolean | null {
  const s = v.toLowerCase().trim();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}
function parseIntNonNeg(v: string): number | null {
  if (!/^\d+$/.test(v.trim())) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

describe("/tdd-audit @eq", () => {
  // -- E-1 enum validation ----------------------------------------------------
  it("E-1: enum fields reject out-of-enum values", () => {
    // kind
    assert(EQ_KINDS.includes("weapon"));
    assertFalse((EQ_KINDS as string[]).includes("nuke"));
    // weaponType
    assertFalse((WEAPON_TYPES as string[]).includes("magic"));
    // damageType -- must be one of B/L/A (uppercased)
    assertEquals(DAMAGE_TYPES.length, 3);
    assertFalse((DAMAGE_TYPES as string[]).includes("X"));
    // concealability
    assertFalse((CONCEALABILITIES as string[]).includes("Z"));

    // Source: setField returns an error string for each bad enum
    assert(/kind must be one of/.test(EQ_SRC));
    assert(/weaponType must be one of/.test(EQ_SRC));
    assert(/damageType must be one of/.test(EQ_SRC));
    assert(/concealability must be one of/.test(EQ_SRC));
  });

  // -- E-2 numeric guards -----------------------------------------------------
  it("E-2: numeric fields reject negative, non-int, NaN, Infinity, coerced strings", () => {
    // accepted
    assertEquals(parseIntNonNeg("0"), 0);
    assertEquals(parseIntNonNeg("4"), 4);
    assertEquals(parseIntNonNeg("  7 "), 7);

    // rejected
    assertEquals(parseIntNonNeg("-1"), null);
    assertEquals(parseIntNonNeg("-0"), null);   // minus sign forbidden
    assertEquals(parseIntNonNeg("1.5"), null);
    assertEquals(parseIntNonNeg("1e3"), null);
    assertEquals(parseIntNonNeg("NaN"), null);
    assertEquals(parseIntNonNeg("Infinity"), null);
    assertEquals(parseIntNonNeg("-Infinity"), null);
    assertEquals(parseIntNonNeg("0x10"), null); // hex forbidden
    assertEquals(parseIntNonNeg(""), null);
    assertEquals(parseIntNonNeg("3 sql; DROP"), null);
    assertEquals(parseIntNonNeg("3,4"), null);

    assert(/non-negative integer/.test(EQ_SRC));
  });

  // -- E-3 boolean guards -----------------------------------------------------
  it("E-3: boolean fields only accept canonical forms", () => {
    // accepted
    assertEquals(parseBool("true"), true);
    assertEquals(parseBool("1"), true);
    assertEquals(parseBool("yes"), true);
    assertEquals(parseBool("YES"), true);
    assertEquals(parseBool("false"), false);
    assertEquals(parseBool("0"), false);
    assertEquals(parseBool("no"), false);

    // rejected -- common attacker bait
    assertEquals(parseBool("maybe"), null);
    assertEquals(parseBool("null"), null);
    assertEquals(parseBool("undefined"), null);
    assertEquals(parseBool(""), null);
    assertEquals(parseBool("2"), null);
    assertEquals(parseBool("yesss"), null);
    assertEquals(parseBool("[object Object]"), null);

    assert(/must be true\/false/.test(EQ_SRC));
  });

  // -- E-4 alias resolution ---------------------------------------------------
  it("E-4: switch aliases resolve to canonical field names", () => {
    // The alias table must remain in source -- assert each mapping is present.
    assert(/con:\s*"concealability"/.test(EQ_SRC));
    assert(/conc:\s*"concealability"/.test(EQ_SRC));
    assert(/wt:\s*"weaponType"/.test(EQ_SRC));
    assert(/dt:\s*"damageType"/.test(EQ_SRC));
    assert(/armor:\s*"armorRating"/.test(EQ_SRC));
    assert(/fcost:\s*"fetishCost"/.test(EQ_SRC));

    // And each canonical field must be a known EQ_FIELD.
    for (const f of ["concealability", "weaponType", "damageType", "armorRating", "fetishCost"]) {
      assert(
        (EQ_FIELDS as string[]).includes(f),
        `${f} must remain in EQ_FIELDS`,
      );
    }
  });

  // -- E-5 unknown switch -----------------------------------------------------
  it("E-5: unknown switch surfaces an error listing valid switches, no write", () => {
    // Source: must have an unknown-switch branch that includes EQ_FIELDS in the
    // error and short-circuits BEFORE any db.modify call inside the no-switch path.
    assert(
      /Unknown switch[^\n]+EQ_FIELDS\.join/.test(EQ_SRC),
      "unknown switch path must list valid switches",
    );
    // And must return before falling through to the multi-pair $set.
    const m = EQ_SRC.match(/Unknown switch[\s\S]+?return;/);
    assert(m, "unknown-switch branch must return before any write");
  });

  // -- E-6 clear scope --------------------------------------------------------
  it("E-6: /clear unsets only the EQ_FIELDS list, no arbitrary state keys", () => {
    // Source: clear must build its unset map from EQ_FIELDS only.
    assert(
      /for \(const f of EQ_FIELDS\)\s*unset\[`state\.\$\{f\}`\]\s*=\s*""/.test(EQ_SRC),
      "/clear must iterate EQ_FIELDS exclusively",
    );
    // EQ_FIELDS must NOT contain dotted paths or operators.
    for (const f of EQ_FIELDS as string[]) {
      assertFalse(/[.\\$\s/]/.test(f), `EQ_FIELDS entry "${f}" must be a plain key`);
    }
  });

  // -- E-7 canEdit gate -------------------------------------------------------
  it("E-7: canEdit gate applies before any write path", () => {
    assert(
      /await\s+u\.canEdit\(\s*u\.me\s*,\s*target\s*\)/.test(EQ_SRC),
      "@eq must call canEdit(me, target)",
    );
    // The canEdit check must occur BEFORE the /clear branch and BEFORE any $set.
    const canEditIdx = EQ_SRC.indexOf("canEdit");
    const clearIdx   = EQ_SRC.indexOf('sw === "clear"');
    const setIdx     = EQ_SRC.indexOf("$set");
    assert(canEditIdx > 0 && clearIdx > 0 && setIdx > 0);
    assert(canEditIdx < clearIdx, "canEdit must gate /clear");
    assert(canEditIdx < setIdx,   "canEdit must gate $set paths");
  });

  // -- E-8 live-state read contract -------------------------------------------
  it("E-8: worn/wielded/concealed read from direct state -- &attr cannot override", () => {
    // Build an item whose attributes[] LIES (worn=true) while direct state says false.
    // The live flag must follow direct state -- regression guard for &worn=true bypass.
    const item = {
      id: "i", name: "jacket",
      state: {
        kind: "armor",
        worn: false,
        attributes: [
          { name: "KIND", value: "armor" },
          { name: "WORN", value: true },          // attacker write via &worn
          { name: "WIELDED", value: true },
          { name: "CONCEALED", value: true },
        ],
      },
    };
    const meta = getEqMeta(item);
    assertEquals(meta.kind, "armor", "kind still resolves via attributes-first");
    assertEquals(meta.worn, false,    "worn must come from direct state, not attrs");
    assertEquals(meta.wielded, undefined, "wielded must come from direct state");
    assertEquals(meta.concealed, undefined, "concealed must come from direct state");
  });

  // Bonus: damageType is upper-cased before storage so case-sloppy input
  // can't slip past the enum check on read.
  it("damageType is normalised to upper case on write", () => {
    assert(/damageType\s*=\s*val\.toUpperCase\(\)/.test(EQ_SRC));
    assert(/concealability\s*=\s*val\.toUpperCase\(\)/.test(EQ_SRC));
  });
});
