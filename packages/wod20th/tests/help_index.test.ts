// tests/help_index.test.ts -- Liberation-style +help index layout.
import { assert, assertEquals } from "@std/assert";
import {
  HELP_WIDTH,
  columnHeader,
  formatHalf,
  formatTopicRows,
  renderHelpIndex,
  resolveTopicSlug,
  sectionBanner,
  allTopics,
  HELP_CATALOG,
} from "../core/helpIndex.ts";

Deno.test("sectionBanner centers label at 78 cols", () => {
  const b = sectionBanner("General");
  assertEquals(b.length, HELP_WIDTH);
  assert(b.includes("General"));
  assert(b.startsWith("="));
  assert(b.endsWith("="));
});

Deno.test("formatHalf pads to half width with dots", () => {
  const h = formatHalf({ topic: "blood", blurb: "Vitae pool" }, 38);
  assertEquals(h.length, 38);
  assert(h.startsWith("BLOOD"));
  assert(h.includes("..."));
  assert(h.includes("Vitae"));
});

Deno.test("formatTopicRows pairs left | right", () => {
  const rows = formatTopicRows([
    { topic: "blood", blurb: "Vitae" },
    { topic: "feed", blurb: "Hunt" },
    { topic: "beast", blurb: "Frenzy" },
  ]);
  assertEquals(rows.length, 2);
  assert(rows[0].includes(" | "));
  assertEquals(rows[0].length, HELP_WIDTH);
  assert(rows[0].includes("BLOOD"));
  assert(rows[0].includes("FEED"));
  assert(rows[1].includes("BEAST"));
});

Deno.test("columnHeader is 78 cols", () => {
  assertEquals(columnHeader().length, HELP_WIDTH);
  assert(columnHeader().includes("Topics"));
  assert(columnHeader().includes("Reference"));
});

Deno.test("renderHelpIndex is Liberation-shaped", () => {
  const out = renderHelpIndex();
  const lines = out.split("%r");
  assert(lines[0].includes("wod20th +help") || lines[0].includes("="));
  assert(lines.some((l) => l.includes("Vampire")));
  assert(lines.some((l) => l.includes("BLOOD")));
  assert(lines.some((l) => l.includes("For help, type")));
  // Every content row must be Latin-1 and <= 78
  for (const l of lines) {
    assert(l.length <= HELP_WIDTH, `wide: ${l.length} ${l}`);
    for (const ch of l) {
      assert(ch.charCodeAt(0) <= 0xff, `non-latin1 in: ${l}`);
    }
  }
});

Deno.test("resolveTopicSlug accepts +blood and prefixes", () => {
  assertEquals(resolveTopicSlug("+blood"), "blood");
  assertEquals(resolveTopicSlug("BLOOD"), "blood");
  assertEquals(resolveTopicSlug("wod20th/vtm"), "vtm");
  assertEquals(resolveTopicSlug("diab"), "diablerie");
});

Deno.test("catalog covers help files for major topics", () => {
  const topics = new Set(allTopics().map((t) => t.topic));
  for (const need of [
    "vtm",
    "blood",
    "pack",
    "chargen",
    "attack",
    "gift",
  ]) {
    assert(topics.has(need), `missing ${need}`);
  }
  assert(HELP_CATALOG.length >= 5);
});
