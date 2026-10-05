// Tests for instanced ("qualified") merits — Language (Spanish), etc.

import { assertEquals, assertThrows, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import {
  parseMeritRef,
  formatMeritLabel,
  formatQualifier,
  splitMeritStorageKey,
} from "../src/dictionary/merits.ts";
import { defaultSheet } from "../src/stats/sheet.ts";
import { setTrait } from "../src/stats/setter.ts";
import { validateTraitValue } from "../src/stats/validate.ts";
import { checkPrerequisites } from "../src/support/prereq.ts";

describe("parseMeritRef", () => {
  it("parses 'language(spanish)' into merit + qualifier + storage key", () => {
    const r = parseMeritRef("language(spanish)");
    assertEquals(r.merit, "language");
    assertEquals(r.qualifier, "spanish");
    assertEquals(r.storageKey, "language:spanish");
  });

  it("accepts the colon syntax 'language:spanish' too", () => {
    const r = parseMeritRef("language:spanish");
    assertEquals(r.storageKey, "language:spanish");
  });

  it("collapses whitespace in qualifier to hyphens", () => {
    const r = parseMeritRef("contacts(Black Market)");
    assertEquals(r.qualifier, "black-market");
    assertEquals(r.storageKey, "contacts:black-market");
  });

  it("returns no qualifier for a bare merit name", () => {
    const r = parseMeritRef("giant");
    assertEquals(r.merit, "giant");
    assertEquals(r.qualifier, "");
    assertEquals(r.storageKey, "giant");
  });
});

describe("formatQualifier", () => {
  it("returns empty string for empty input", () => {
    assertEquals(formatQualifier(""), "");
  });

  it("title-cases a single word", () => {
    assertEquals(formatQualifier("spanish"), "Spanish");
  });

  it("title-cases and replaces hyphens with spaces for multi-word slugs", () => {
    assertEquals(formatQualifier("black-market"), "Black Market");
    assertEquals(formatQualifier("very-black-market"), "Very Black Market");
  });
});

describe("formatMeritLabel", () => {
  it("renders qualified label as 'Name (Qualifier)' in Title Case", () => {
    assertEquals(formatMeritLabel("language", "spanish"), "Language (Spanish)");
    assertEquals(formatMeritLabel("contacts", "black-market"), "Contacts (Black Market)");
  });

  it("renders bare merit as just its name", () => {
    assertEquals(formatMeritLabel("giant", ""), "Giant");
  });
});

describe("splitMeritStorageKey", () => {
  it("splits 'language:spanish' into parts", () => {
    const s = splitMeritStorageKey("language:spanish");
    assertEquals(s, { merit: "language", qualifier: "spanish" });
  });

  it("returns empty qualifier for a bare key", () => {
    assertEquals(splitMeritStorageKey("giant"), { merit: "giant", qualifier: "" });
  });
});

describe("instanced merit validation", () => {
  it("rejects setting an instanced merit without a qualifier", () => {
    const sheet = defaultSheet();
    assertThrows(
      () => validateTraitValue("language", "1", sheet),
      Error,
      "requires a qualifier",
    );
  });

  it("rejects a qualifier on a non-instanced merit", () => {
    const sheet = defaultSheet();
    assertThrows(
      () => validateTraitValue("giant(big)", "4", sheet),
      Error,
      "does not take a qualifier",
    );
  });

  it("accepts a valid qualified set", () => {
    const sheet = defaultSheet();
    const v = validateTraitValue("language(spanish)", "1", sheet);
    assertEquals(v, 1);
  });
});

describe("instanced merit storage", () => {
  it("setTrait writes under the qualified storage key", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "language(spanish)", 1);
    assertEquals(sheet.merits["language:spanish"], 1);
    assertEquals(sheet.merits["language"], undefined);
  });

  it("two qualifiers of the same merit live as separate entries", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "language(spanish)", 1);
    sheet = setTrait(sheet, "language(russian)", 1);
    assertEquals(sheet.merits["language:spanish"], 1);
    assertEquals(sheet.merits["language:russian"], 1);
  });

  it("setting an instanced merit to 0 deletes the qualified key", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "language(spanish)", 1);
    sheet = setTrait(sheet, "language(spanish)", 0);
    assertEquals(sheet.merits["language:spanish"], undefined);
  });
});

describe("qualified-merit prereqs", () => {
  it("matches exact qualifier when prereq is fully qualified", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "language(spanish)", 1);
    const ok = checkPrerequisites(["language(spanish)>=1"], sheet);
    assertEquals(ok.valid, true);

    const bad = checkPrerequisites(["language(russian)>=1"], sheet);
    assertEquals(bad.valid, false);
  });

  it("bare prereq matches the highest instance across all qualifiers", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "contacts(police)", 2);
    sheet = setTrait(sheet, "contacts(press)", 3);
    const r = checkPrerequisites(["contacts>=3"], sheet);
    assertEquals(r.valid, true, r.reason);

    const tooHigh = checkPrerequisites(["contacts>=4"], sheet);
    assertEquals(tooHigh.valid, false);
    assertStringIncludes(tooHigh.reason ?? "", "Current value: 3");
  });
});
