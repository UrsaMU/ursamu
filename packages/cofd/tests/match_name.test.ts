/**
 * Partial name matching for +cg/set catalogs (attrs / skills / merits).
 */
import {
  assertEquals,
  assertThrows,
  assertStringIncludes,
  assert,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  matchName,
  matchNameOrThrow,
  suggestNames,
  contentTokens,
} from "../src/support/match.ts";
import {
  COFD_ATTRIBUTES,
  COFD_SKILLS,
  COFD_MERITS,
} from "../src/dictionary/index.ts";
import {
  initCgState,
  updateCgState,
  type CofdCgState,
} from "../src/chargen/state.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const MERIT_KEYS = COFD_MERITS.map((m) => m.key);

function stage4(): CofdCgState {
  const s = initCgState();
  s.stage = 4;
  return s;
}

function stage5(): CofdCgState {
  const s = initCgState();
  s.stage = 5;
  return s;
}

function stage6(): CofdCgState {
  const s = initCgState();
  s.stage = 6;
  return s;
}

describe("matchName", OPTS, () => {
  it("exact match (case-insensitive)", () => {
    const r = matchName("Intelligence", COFD_ATTRIBUTES);
    assertEquals(r, { kind: "match", value: "intelligence" });
  });

  it("unique prefix: int → intelligence", () => {
    const r = matchName("int", COFD_ATTRIBUTES);
    assertEquals(r, { kind: "match", value: "intelligence" });
  });

  it("unique prefix: str → strength", () => {
    const r = matchName("str", COFD_ATTRIBUTES);
    assertEquals(r, { kind: "match", value: "strength" });
  });

  it("unique prefix: dex → dexterity", () => {
    const r = matchName("dex", COFD_ATTRIBUTES);
    assertEquals(r, { kind: "match", value: "dexterity" });
  });

  it("ambiguous prefix: st → strength, stamina", () => {
    const r = matchName("st", COFD_ATTRIBUTES);
    assertEquals(r.kind, "ambiguous");
    if (r.kind === "ambiguous") {
      assertEquals(r.matches.includes("strength"), true);
      assertEquals(r.matches.includes("stamina"), true);
    }
  });

  it("none: xyz", () => {
    assertEquals(matchName("xyz", COFD_ATTRIBUTES), { kind: "none" });
  });

  it("unique skill prefix: ath → athletics", () => {
    const r = matchName("ath", COFD_SKILLS);
    assertEquals(r, { kind: "match", value: "athletics" });
  });

  it("skill with space: animal → animal ken", () => {
    const r = matchName("animal", COFD_SKILLS);
    assertEquals(r, { kind: "match", value: "animal ken" });
  });

  it("stop words: body as a weapon → body as weapon", () => {
    const r = matchName("body as a weapon", MERIT_KEYS);
    assertEquals(r.kind, "match");
    if (r.kind === "match") {
      assertEquals(r.value, "body as weapon");
    }
  });

  it("content tokens: body weapon → body as weapon", () => {
    const r = matchName("body weapon", MERIT_KEYS);
    assertEquals(r.kind, "match");
    if (r.kind === "match") {
      assertEquals(r.value, "body as weapon");
    }
  });

  it("matchNameOrThrow throws on ambiguous", () => {
    assertThrows(
      () => matchNameOrThrow("st", COFD_ATTRIBUTES, "attribute"),
      Error,
      "Ambiguous attribute",
    );
  });

  it("matchNameOrThrow never dumps the full catalog", () => {
    try {
      matchNameOrThrow("zzzz", MERIT_KEYS, "merit", "+cg/list merits");
      assert(false, "expected throw");
    } catch (e) {
      const msg = (e as Error).message;
      assertStringIncludes(msg, "Unknown merit");
      // Must stay short — no multi-hundred-name dump.
      assert(
        msg.length < 200,
        `error too long (${msg.length}): ${msg}`,
      );
      assertEquals(msg.includes("Valid:"), false);
      assertStringIncludes(msg, "+cg/list merits");
    }
  });

  it("matchNameOrThrow suggests near misses", () => {
    try {
      matchNameOrThrow("boddy as weapon", MERIT_KEYS, "merit");
      assert(false, "expected throw");
    } catch (e) {
      const msg = (e as Error).message;
      // Typo won't exact-match; suggestions should mention body.
      assert(
        msg.includes("Did you mean") || msg.includes("Browse") ||
          msg.includes("Try") || msg.includes("No close"),
      );
      assert(msg.length < 280, `too long: ${msg}`);
    }
  });

  it("suggestNames ranks shared tokens", () => {
    const s = suggestNames("body weapon", MERIT_KEYS, 3);
    assertEquals(s[0], "body as weapon");
  });

  it("contentTokens drops stop words", () => {
    assertEquals(
      contentTokens("body as a weapon"),
      ["body", "weapon"],
    );
  });
});

describe("updateCgState partial attribute names", OPTS, () => {
  it("+cg/set int=2 resolves to intelligence", () => {
    const next = updateCgState(stage4(), "int", "2");
    assertEquals(next.sheet.attributes.intelligence, 2);
  });

  it("+cg/set str=3 resolves to strength", () => {
    const next = updateCgState(stage4(), "str", "3");
    assertEquals(next.sheet.attributes.strength, 3);
  });

  it("+cg/set man=4 resolves to manipulation", () => {
    const next = updateCgState(stage4(), "man", "4");
    assertEquals(next.sheet.attributes.manipulation, 4);
  });

  it("+cg/set st=2 is ambiguous", () => {
    assertThrows(
      () => updateCgState(stage4(), "st", "2"),
      Error,
      "Ambiguous attribute",
    );
  });

  it("+cg/set foo=2 is unknown", () => {
    assertThrows(
      () => updateCgState(stage4(), "foo", "2"),
      Error,
      "Unknown attribute",
    );
  });

  it("full name still works", () => {
    const next = updateCgState(stage4(), "composure", "5");
    assertEquals(next.sheet.attributes.composure, 5);
  });
});

describe("updateCgState partial skill names", OPTS, () => {
  it("+cg/set ath=2 resolves to athletics", () => {
    const next = updateCgState(stage5(), "ath", "2");
    assertEquals(next.sheet.skills.athletics, 2);
  });

  it("+cg/set inv=3 resolves to investigation", () => {
    const next = updateCgState(stage5(), "inv", "3");
    assertEquals(next.sheet.skills.investigation, 3);
  });

  it("+cg/set animal=1 resolves to animal ken", () => {
    const next = updateCgState(stage5(), "animal", "1");
    assertEquals(next.sheet.skills["animal ken"], 1);
  });
});

describe("updateCgState merit names", OPTS, () => {
  function stage6Ready(): CofdCgState {
    const s = stage6();
    // Body as Weapon: Stamina >= 3, Brawl >= 2.
    s.sheet.attributes.stamina = 3;
    s.sheet.skills.brawl = 2;
    return s;
  }

  it("+cg/set body as a weapon=2 resolves catalog key", () => {
    const next = updateCgState(
      stage6Ready(),
      "body as a weapon",
      "2",
    );
    assertEquals(next.sheet.merits["body as weapon"], 2);
  });

  it("+cg/set body as weapon=2 still works", () => {
    const next = updateCgState(
      stage6Ready(),
      "body as weapon",
      "2",
    );
    assertEquals(next.sheet.merits["body as weapon"], 2);
  });

  it("unknown merit error is short with browse hint", () => {
    try {
      updateCgState(stage6(), "not a real merit xyz", "1");
      assert(false, "expected throw");
    } catch (e) {
      const msg = (e as Error).message;
      assertStringIncludes(msg, "Unknown merit");
      assert(msg.length < 220, `too long: ${msg}`);
      assertEquals(msg.includes("Valid:"), false);
      assertStringIncludes(msg, "+cg/list merits");
    }
  });
});
