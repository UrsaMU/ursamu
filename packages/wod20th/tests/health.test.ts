// tests/health.test.ts -- Unit tests for WoD20th health track logic.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import {
  initTrack,
  getTrack,
  applyDamage,
  healDamage,
  parseDamageType,
  markChar,
  markCell,
  HEALTH_TRACK_SIZE,
} from "../core/health.ts";
import type { IWoDChar, DamageMark } from "../core/types.ts";

// -- Helpers ----------------------------------------------------------------

function minChar(): Pick<IWoDChar, "healthTrack"> & Partial<IWoDChar> {
  return {} as IWoDChar;
}

// -- initTrack --------------------------------------------------------------

describe("initTrack", () => {
  it("returns 7 empty slots", () => {
    const t = initTrack();
    assertEquals(t.length, HEALTH_TRACK_SIZE);
    t.forEach((m) => assertStrictEquals(m, ""));
  });
});

// -- getTrack ---------------------------------------------------------------

describe("getTrack", () => {
  it("initialises missing track", () => {
    const char = minChar() as IWoDChar;
    const t = getTrack(char);
    assertEquals(t.length, HEALTH_TRACK_SIZE);
    assertEquals(char.healthTrack, t);
  });

  it("returns existing track unchanged", () => {
    const char = minChar() as IWoDChar;
    char.healthTrack = ["B", "", "", "", "", "", ""];
    const t = getTrack(char);
    assertEquals(t[0], "B");
  });

  it("re-initialises a corrupt track (wrong length)", () => {
    const char = minChar() as IWoDChar;
    char.healthTrack = ["L"] as DamageMark[];
    const t = getTrack(char);
    assertEquals(t.length, HEALTH_TRACK_SIZE);
  });
});

// -- applyDamage ------------------------------------------------------------

describe("applyDamage", () => {
  it("fills empty slots from Bruised end", () => {
    const char = minChar() as IWoDChar;
    applyDamage(char, "B", 3);
    assertEquals(char.healthTrack!.slice(0, 3), ["B", "B", "B"]);
    assertEquals(char.healthTrack![3], "");
  });

  it("returns 0 overflow when track has room", () => {
    const char = minChar() as IWoDChar;
    const over = applyDamage(char, "L", 5);
    assertStrictEquals(over, 0);
  });

  it("returns overflow when track is full of lethal", () => {
    const char = minChar() as IWoDChar;
    applyDamage(char, "L", 7); // fill all with lethal
    const over = applyDamage(char, "L", 2);
    assertStrictEquals(over, 2);
  });

  it("upgrades lighter damage slots", () => {
    const char = minChar() as IWoDChar;
    applyDamage(char, "B", 7); // fill with bashing
    applyDamage(char, "L", 3); // upgrade 3 slots to lethal
    const lethalCount = char.healthTrack!.filter((m) => m === "L").length;
    assertStrictEquals(lethalCount, 3);
  });

  it("does not downgrade heavier damage -- agg stays at index 0", () => {
    const char = minChar() as IWoDChar;
    applyDamage(char, "A", 2);
    applyDamage(char, "B", 3);
    // After compact (heaviest first): [A, A, B, B, B, "", ""]
    assertEquals(char.healthTrack![0], "A");
    assertEquals(char.healthTrack![1], "A");
    assertEquals(char.healthTrack![2], "B");
  });

  it("overflow bashing upgrades existing bashing to lethal", () => {
    const char = minChar() as IWoDChar;
    applyDamage(char, "B", 7);                   // fill with bashing
    const overflow = applyDamage(char, "B", 3);  // 3 overflow -> upgrade B->L
    assertEquals(char.healthTrack!.filter((m) => m === "L").length, 3);
    assertEquals(char.healthTrack!.filter((m) => m === "B").length, 4);
    assertEquals(overflow, 0);
  });

  it("overflow bashing kills when track has no bashing to upgrade", () => {
    const char = minChar() as IWoDChar;
    applyDamage(char, "L", 7);                   // fill with lethal
    const overflow = applyDamage(char, "B", 2);  // no B to upgrade -- overflow
    assertEquals(overflow, 2);
    assertEquals(char.healthTrack!.every((m) => m === "L"), true);
  });

  it("compact keeps heaviest damage at lowest index", () => {
    const char = minChar() as IWoDChar;
    applyDamage(char, "B", 3);
    applyDamage(char, "A", 1);
    // Agg should be at index 0, bashing at 1-3
    assertEquals(char.healthTrack![0], "A");
    assertEquals(char.healthTrack![1], "B");
  });
});

// -- healDamage -------------------------------------------------------------

describe("healDamage", () => {
  it("heals the requested type", () => {
    const char = minChar() as IWoDChar;
    applyDamage(char, "B", 3);
    healDamage(char, "B", 2);
    const bashing = char.healthTrack!.filter((m) => m === "B").length;
    assertStrictEquals(bashing, 1);
  });

  it("returns number of boxes actually healed", () => {
    const char = minChar() as IWoDChar;
    applyDamage(char, "L", 2);
    const healed = healDamage(char, "L", 5); // only 2 available
    assertStrictEquals(healed, 2);
  });

  it("returns 0 when nothing to heal", () => {
    const char = minChar() as IWoDChar;
    const healed = healDamage(char, "B", 3);
    assertStrictEquals(healed, 0);
  });

  it("heals from most severe slot first, remaining packs left", () => {
    const char = minChar() as IWoDChar;
    applyDamage(char, "B", 4);
    healDamage(char, "B", 1);
    // 3 bashing remain, compacted to indices 0-2
    assertEquals(char.healthTrack!.filter((m) => m === "B").length, 3);
    assertEquals(char.healthTrack![0], "B");
    assertEquals(char.healthTrack![3], "");
  });

  it("heals 'all' by lightest type first", () => {
    const char = minChar() as IWoDChar;
    applyDamage(char, "B", 2);
    applyDamage(char, "L", 2);
    healDamage(char, "all", 2);
    // bashing healed first
    const bashing = char.healthTrack!.filter((m) => m === "B").length;
    const lethal  = char.healthTrack!.filter((m) => m === "L").length;
    assertStrictEquals(bashing, 0);
    assertStrictEquals(lethal, 2);
  });

  it("compacts track after heal -- no gaps left in filled slots", () => {
    const char = minChar() as IWoDChar;
    applyDamage(char, "B", 2); // [B, B, "", "", "", "", ""]
    applyDamage(char, "L", 2); // [B, B, L, L, "", "", ""]
    healDamage(char, "all", 3); // heals 2B + 1L, leaving 1L
    // After compact: [L, "", "", "", "", "", ""] -- no gap at index 0
    assertEquals(char.healthTrack![0], "L");
    assertEquals(char.healthTrack![1], "");
  });

  it("does not heal a different damage type", () => {
    const char = minChar() as IWoDChar;
    applyDamage(char, "L", 3);
    healDamage(char, "B", 3); // healing bashing when only lethal present
    const lethal = char.healthTrack!.filter((m) => m === "L").length;
    assertStrictEquals(lethal, 3);
  });
});

// -- parseDamageType --------------------------------------------------------

describe("parseDamageType", () => {
  it("parses 'bashing' and 'b'", () => {
    assertStrictEquals(parseDamageType("bashing"), "B");
    assertStrictEquals(parseDamageType("b"), "B");
    assertStrictEquals(parseDamageType("B"), "B");
  });

  it("parses 'lethal' and 'l'", () => {
    assertStrictEquals(parseDamageType("lethal"), "L");
    assertStrictEquals(parseDamageType("l"), "L");
  });

  it("parses aggravated variants", () => {
    assertStrictEquals(parseDamageType("aggravated"), "A");
    assertStrictEquals(parseDamageType("agg"), "A");
    assertStrictEquals(parseDamageType("a"), "A");
  });

  it("returns null for unknown input", () => {
    assertStrictEquals(parseDamageType("fire"), null);
    assertStrictEquals(parseDamageType(""), null);
  });
});

// -- markChar / markCell ----------------------------------------------------

describe("markChar", () => {
  it("maps B->/ L->X A->* empty->space", () => {
    assertStrictEquals(markChar("B"), "/");
    assertStrictEquals(markChar("L"), "X");
    assertStrictEquals(markChar("A"), "*");
    assertStrictEquals(markChar(""),  " ");
  });
});

describe("markCell", () => {
  it("wraps mark in brackets", () => {
    assertStrictEquals(markCell("B"), "[/]");
    assertStrictEquals(markCell("L"), "[X]");
    assertStrictEquals(markCell("A"), "[*]");
    assertStrictEquals(markCell(""),  "[ ]");
  });
});
