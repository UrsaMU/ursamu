/**
 * Tests -- UTF-8 glyph mode helpers (commands/chargen.ts)
 *
 * Verifies:
 *   - Every horizontal rule helper renders exactly 78 visible cells in both modes.
 *   - Mode-aware helpers swap glyphs correctly when wrapped in runWithMode.
 *   - withAscii() forces ascii inside its callback regardless of outer mode.
 *   - gauge() and pill() emit correct visible widths.
 *   - ALS context (runWithMode) survives async work and isolates between scopes.
 */
import { assert, assertEquals, assertMatch } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  W, bar, div, hdr, scan, gauge, pill,
  frameTop, frameBot, runWithMode, withAscii, getMode, setGlyphs,
} from "../commands/chargen.ts";

/** Strip MUSH color/format codes so length checks see only visible chars. */
const plain = (s: string) => s.replace(/%c[a-z]|%[rtnb]/gi, "");

describe("glyph mode resolution", () => {
  it("defaults to ascii when no mode is set", () => {
    setGlyphs(null);
    assertEquals(getMode(), "ascii");
  });

  it("runWithMode switches mode for the duration of the callback", () => {
    setGlyphs(null);
    const out = runWithMode("utf8", () => getMode());
    assertEquals(out, "utf8");
    assertEquals(getMode(), "ascii"); // reverts on scope exit
  });

  it("withAscii forces ascii inside an outer utf8 scope", () => {
    setGlyphs(null);
    const result = runWithMode("utf8", () =>
      [getMode(), withAscii(() => getMode()), getMode()]
    );
    assertEquals(result, ["utf8", "ascii", "utf8"]);
  });

  it("ALS context propagates across awaits", async () => {
    setGlyphs(null);
    const observed = await runWithMode("utf8", async () => {
      await new Promise((r) => setTimeout(r, 1));
      return getMode();
    });
    assertEquals(observed, "utf8");
  });

  it("setGlyphs forces mode regardless of ALS", () => {
    setGlyphs("utf8");
    assertEquals(getMode(), "utf8");
    runWithMode("ascii", () => assertEquals(getMode(), "utf8"));
    setGlyphs(null);
  });
});

describe("78-char width invariant", () => {
  it("bar() is exactly 78 visible cells in ascii", () => {
    setGlyphs("ascii");
    assertEquals(plain(bar()).length, W);
    setGlyphs(null);
  });

  it("bar() is exactly 78 visible cells in utf8", () => {
    setGlyphs("utf8");
    assertEquals(plain(bar()).length, W);
    setGlyphs(null);
  });

  it("div() is exactly 78 visible cells in both modes", () => {
    setGlyphs("ascii"); assertEquals(plain(div()).length, W);
    setGlyphs("utf8");  assertEquals(plain(div()).length, W);
    setGlyphs(null);
  });

  it("hdr() is exactly 78 visible cells in both modes", () => {
    setGlyphs("ascii"); assertEquals(plain(hdr("CHARSHEET")).length, W);
    setGlyphs("utf8");  assertEquals(plain(hdr("CHARSHEET")).length, W);
    setGlyphs(null);
  });

  it("hdr() handles short and long titles within 78", () => {
    setGlyphs("utf8");
    for (const t of ["A", "SHEET", "NIGHT CITY DATATERM"]) {
      assertEquals(plain(hdr(t)).length, W, `hdr("${t}")`);
    }
    setGlyphs(null);
  });

  it("frameTop with title and right tag is exactly 78", () => {
    setGlyphs("utf8");
    const line = frameTop({ title: "CHARSHEET", right: "NC-2045 :: V // SOLO" });
    assertEquals(plain(line).length, W);
    setGlyphs("ascii");
    assertEquals(plain(frameTop({ title: "CHARSHEET", right: "NC-2045" })).length, W);
    setGlyphs(null);
  });

  it("frameTop with no tags is exactly 78", () => {
    setGlyphs("utf8"); assertEquals(plain(frameTop()).length, W);
    setGlyphs("ascii"); assertEquals(plain(frameTop()).length, W);
    setGlyphs(null);
  });

  it("frameBot with right tag is exactly 78", () => {
    setGlyphs("utf8"); assertEquals(plain(frameBot({ right: "EOF :: 04:13:22" })).length, W);
    setGlyphs("ascii"); assertEquals(plain(frameBot({ right: "EOF" })).length, W);
    setGlyphs(null);
  });

  it("scan() is 78 cells in utf8, empty in ascii", () => {
    setGlyphs("utf8"); assertEquals(plain(scan()).length, W);
    setGlyphs("ascii"); assertEquals(scan(), "");
    setGlyphs(null);
  });
});

describe("glyph table selection", () => {
  it("bar() uses '═' in utf8 and '=' in ascii", () => {
    setGlyphs("utf8");  assertMatch(plain(bar()), /═/);
    setGlyphs("ascii"); assertMatch(plain(bar()), /=/);
    setGlyphs(null);
  });

  it("div() uses '─' in utf8 and '-' in ascii", () => {
    setGlyphs("utf8");  assertMatch(plain(div()), /─/);
    setGlyphs("ascii"); assertMatch(plain(div()), /-/);
    setGlyphs(null);
  });

  it("frameTop uses ╔/╗ corners in utf8 and + in ascii", () => {
    setGlyphs("utf8");
    const u = plain(frameTop({ title: "X" }));
    assert(u.startsWith("╔") && u.endsWith("╗"), `utf8 corners: ${u}`);
    setGlyphs("ascii");
    const a = plain(frameTop({ title: "X" }));
    assert(a.startsWith("+") && a.endsWith("+"), `ascii corners: ${a}`);
    setGlyphs(null);
  });

  it("frameBot uses ╚/╝ corners in utf8", () => {
    setGlyphs("utf8");
    const u = plain(frameBot({ right: "EOF" }));
    assert(u.startsWith("╚") && u.endsWith("╝"));
    setGlyphs(null);
  });
});

describe("gauge()", () => {
  it("renders [██████░░░░] in utf8 at 60%", () => {
    setGlyphs("utf8");
    const out = plain(gauge(6, 10));
    assertEquals(out, "[██████░░░░]");
    setGlyphs(null);
  });

  it("renders [######----] in ascii at 60%", () => {
    setGlyphs("ascii");
    assertEquals(plain(gauge(6, 10)), "[######----]");
    setGlyphs(null);
  });

  it("clamps cur to [0, max]", () => {
    setGlyphs("ascii");
    assertEquals(plain(gauge(-5, 10)), "[----------]");
    assertEquals(plain(gauge(99, 10)), "[##########]");
    setGlyphs(null);
  });

  it("handles max=0 without dividing by zero", () => {
    setGlyphs("ascii");
    assertEquals(plain(gauge(0, 0)), "[----------]");
    setGlyphs(null);
  });

  it("honors custom width", () => {
    setGlyphs("ascii");
    assertEquals(plain(gauge(2, 4, 4)), "[##--]");
    setGlyphs(null);
  });
});

describe("pill()", () => {
  it("is always 14 visible cells (`[ TEXT       ]`)", () => {
    for (const t of ["OK", "HIT", "CRITICAL", "NOMINAL", "JACKED IN", "X"]) {
      assertEquals(plain(pill(t, "ok")).length, 14, `pill("${t}")`);
    }
  });

  it("uppercases and pads short text", () => {
    assertEquals(plain(pill("hit", "ok")), "[ HIT        ]");
  });

  it("truncates over-long text to 10 inner cells", () => {
    assertEquals(plain(pill("averyverylongstatus", "info")), "[ AVERYVERYL ]");
  });

  it("emits color codes for each tone", () => {
    assertMatch(pill("OK",   "ok"),   /%cg/);
    assertMatch(pill("WARN", "warn"), /%cy/);
    assertMatch(pill("BAD",  "bad"),  /%cr/);
    assertMatch(pill("INFO", "info"), /%cc/);
    assertMatch(pill("ALT",  "alt"),  /%cm/);
  });
});
