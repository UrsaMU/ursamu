/**
 * Tests for backlinks.ts — normWikilinkTarget, extractWikilinks, resolveWikilinks
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { normWikilinkTarget, extractWikilinks, resolveWikilinks } from "../src/backlinks.ts";

describe("normWikilinkTarget", () => {
  it("lowercases", () => {
    assertEquals(normWikilinkTarget("My Page"), "my-page");
  });

  it("replaces spaces with hyphens", () => {
    assertEquals(normWikilinkTarget("Battle of Shadows"), "battle-of-shadows");
  });

  it("handles already-normalised path", () => {
    assertEquals(normWikilinkTarget("news/battle-2026"), "news/battle-2026");
  });

  it("trims leading/trailing whitespace", () => {
    assertEquals(normWikilinkTarget("  My Page  "), "my-page");
  });
});

describe("extractWikilinks", () => {
  it("extracts single wikilink", () => {
    const links = extractWikilinks("See [[My Page]] for details.");
    assertEquals(links, ["My Page"]);
  });

  it("extracts multiple wikilinks", () => {
    const links = extractWikilinks("Links: [[Page A]] and [[Page B]].");
    assertEquals(links.length, 2);
    assertEquals(links.includes("Page A"), true);
    assertEquals(links.includes("Page B"), true);
  });

  it("returns empty for no wikilinks", () => {
    assertEquals(extractWikilinks("No links here."), []);
  });

  it("handles path-style wikilinks", () => {
    const links = extractWikilinks("See [[news/battle-2026]].");
    assertEquals(links[0], "news/battle-2026");
  });
});

describe("resolveWikilinks", () => {
  it("transforms [[Page]] to markdown link", () => {
    const result = resolveWikilinks("See [[My Page]] for details.");
    assertStringIncludes(result, "[My Page](/wiki/my-page)");
  });

  it("handles multiple wikilinks", () => {
    const result = resolveWikilinks("[[Page A]] and [[Page B]]");
    assertStringIncludes(result, "[Page A](/wiki/page-a)");
    assertStringIncludes(result, "[Page B](/wiki/page-b)");
  });

  it("leaves non-wikilink text unchanged", () => {
    const result = resolveWikilinks("No links here.");
    assertEquals(result, "No links here.");
  });

  it("handles path-style target", () => {
    const result = resolveWikilinks("See [[news/battle-2026]].");
    assertStringIncludes(result, "[news/battle-2026](/wiki/news/battle-2026)");
  });
});
