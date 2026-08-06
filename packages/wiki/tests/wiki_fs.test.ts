/**
 * Tests for fs.ts — parseFrontmatter, serializePage, walkWiki, safePath, normalisePath
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";
import { join } from "@std/path";
import {
  parseFrontmatter,
  serializePage,
  walkWiki,
  safePath,
  normalisePath,
  mergeWikiEditMeta,
} from "../src/fs.ts";

// ─── parseFrontmatter ─────────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("parses full frontmatter block", () => {
    const raw = `---\ntitle: Test Page\nauthor: Alice\ntags: [ic, lore]\ndraft: false\n---\n\nBody here.`;
    const { meta, body } = parseFrontmatter(raw);
    assertEquals(meta.title, "Test Page");
    assertEquals(meta.author, "Alice");
    assertEquals(meta.tags, ["ic", "lore"]);
    assertEquals(meta.draft, false);
    assertEquals(body, "Body here.");
  });

  it("returns empty meta when no frontmatter", () => {
    const { meta, body } = parseFrontmatter("Just a body.");
    assertEquals(meta, {});
    assertEquals(body, "Just a body.");
  });

  it("parses empty tags array", () => {
    const { meta } = parseFrontmatter("---\ntags: []\n---\n\nbody");
    assertEquals(meta.tags, []);
  });

  it("parses numeric values", () => {
    const { meta } = parseFrontmatter("---\norder: 5\n---\n\nbody");
    assertEquals(meta.order, 5);
  });

  it("parses boolean true", () => {
    const { meta } = parseFrontmatter("---\ndraft: true\n---\n\nbody");
    assertEquals(meta.draft, true);
  });
});

// ─── serializePage ────────────────────────────────────────────────────────────

describe("serializePage", () => {
  it("round-trips meta + body", () => {
    const meta = { title: "Hello", tags: ["ic"] };
    const body = "Content here.";
    const serialized = serializePage(meta, body);
    const { meta: m2, body: b2 } = parseFrontmatter(serialized);
    assertEquals(m2.title, "Hello");
    assertEquals(m2.tags, ["ic"]);
    assertEquals(b2, body);
  });

  it("skips null/undefined values", () => {
    const result = serializePage({ title: "X", empty: null, missing: undefined }, "body");
    assertEquals(result.includes("empty"), false);
    assertEquals(result.includes("missing"), false);
  });

  it("serializes arrays with brackets", () => {
    const result = serializePage({ tags: ["a", "b"] }, "body");
    assertStringIncludes(result, "tags: [a, b]");
  });
});

// ─── mergeWikiEditMeta ───────────────────────────────────────────────────────

describe("mergeWikiEditMeta", () => {
  it("keeps original author when client sends another", () => {
    const merged = mergeWikiEditMeta(
      { title: "Kiths", author: "Medea", date: "2024-01-01" },
      { title: "Kiths", author: "Bob", body: "nope" },
    );
    assertEquals(merged.author, "Medea");
    assertEquals(merged.title, "Kiths");
  });

  it("bumps date to today on every edit", () => {
    const today = new Date().toISOString().slice(0, 10);
    const merged = mergeWikiEditMeta(
      { author: "Medea", date: "2020-06-15" },
      { title: "Updated" },
    );
    assertEquals(merged.date, today);
    assertEquals(merged.author, "Medea");
  });

  it("ignores client date override", () => {
    const today = new Date().toISOString().slice(0, 10);
    const merged = mergeWikiEditMeta(
      { author: "Medea", date: "2020-01-01" },
      { date: "1999-12-31", draft: false },
    );
    assertEquals(merged.date, today);
    assertEquals(merged.draft, false);
  });

  it("leaves empty author empty (no inventing)", () => {
    const merged = mergeWikiEditMeta(
      { title: "X" },
      { author: "Sneaky", title: "Y" },
    );
    assertEquals(merged.author, undefined);
    assertEquals(merged.title, "Y");
  });
});

// ─── safePath ────────────────────────────────────────────────────────────────

describe("safePath", () => {
  it("returns path inside WIKI_DIR", () => {
    const p = safePath("news/battle.md");
    assertEquals(typeof p, "string");
  });

  it("rejects path traversal", () => {
    assertEquals(safePath("../etc/passwd"), null);
    assertEquals(safePath("news/../../etc/passwd"), null);
  });

  it("allows nested path", () => {
    const p = safePath("a/b/c.md");
    assertEquals(p !== null, true);
  });
});

// ─── normalisePath ────────────────────────────────────────────────────────────

describe("normalisePath", () => {
  it("strips leading slashes", () => {
    assertEquals(normalisePath("/news/battle"), "news/battle");
  });

  it("collapses double slashes", () => {
    assertEquals(normalisePath("news//battle"), "news/battle");
  });

  it("strips trailing slash", () => {
    assertEquals(normalisePath("news/battle/"), "news/battle");
  });

  it("handles plain path unchanged", () => {
    assertEquals(normalisePath("news/battle"), "news/battle");
  });
});

// ─── walkWiki ─────────────────────────────────────────────────────────────────

describe("walkWiki", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await Deno.makeTempDir();
    await Deno.mkdir(join(tmpDir, "sub"), { recursive: true });
    await Deno.writeTextFile(join(tmpDir, "page.md"), "---\ntitle: Page\n---\n\nbody");
    await Deno.writeTextFile(join(tmpDir, "README.md"), "# readme");
    await Deno.writeTextFile(join(tmpDir, "sub", "child.md"), "---\ntitle: Child\n---\n\nbody");
    await Deno.writeTextFile(join(tmpDir, ".hidden.md"), "hidden");
  });

  afterEach(async () => {
    await Deno.remove(tmpDir, { recursive: true });
  });

  it("yields .md files and excludes README.md and dot-files", async () => {
    const found: string[] = [];
    for await (const { urlPath } of walkWiki(tmpDir)) found.push(urlPath);
    assertEquals(found.includes("page"), true);
    assertEquals(found.includes("sub/child"), true);
    assertEquals(found.includes("README"), false);
    assertEquals(found.includes(".hidden"), false);
  });

  it("returns empty for non-existent directory", async () => {
    const found: string[] = [];
    for await (const { urlPath } of walkWiki("/nonexistent/path")) found.push(urlPath);
    assertEquals(found.length, 0);
  });
});
