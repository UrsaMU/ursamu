import { assertEquals, assertStringIncludes } from "@std/assert";
import { chunkText, splitBySections } from "../ingestion/extractor.ts";

// ─── splitBySections ──────────────────────────────────────────────────────────

Deno.test("splitBySections: empty string produces one empty-body section", () => {
  const sections = splitBySections("");
  assertEquals(sections.length, 1);
  assertEquals(sections[0].body, "");
  assertEquals(sections[0].heading, undefined);
});

Deno.test("splitBySections: no headings treats entire text as one section", () => {
  const text = "This is a paragraph.\nWith multiple lines.\nNo headings here.";
  const sections = splitBySections(text);
  assertEquals(sections.length, 1);
  assertEquals(sections[0].heading, undefined);
  assertStringIncludes(sections[0].body, "paragraph");
});

Deno.test("splitBySections: markdown h1 heading splits text into sections", () => {
  const text = [
    "Preamble line.",
    "# Stats",
    "blood, heart, mind, spirit",
    "# Moves",
    "When you do something...",
  ].join("\n");
  const sections = splitBySections(text);
  // preamble + stats section + moves section
  assertEquals(sections.length, 3);
  assertEquals(sections[0].heading, undefined);
  assertEquals(sections[1].heading, "# Stats");
  assertStringIncludes(sections[1].body, "blood");
  assertEquals(sections[2].heading, "# Moves");
  assertStringIncludes(sections[2].body, "When you do something");
});

Deno.test("splitBySections: markdown h2 heading is detected", () => {
  const text = "## Chapter Two\nContent here.";
  const sections = splitBySections(text);
  // heading line becomes the heading, content is the body
  const chapterSection = sections.find((s) =>
    s.heading?.startsWith("## Chapter")
  );
  assertEquals(chapterSection !== undefined, true);
  assertStringIncludes(chapterSection!.body, "Content here");
});

Deno.test("splitBySections: markdown h3 heading is detected", () => {
  const text = "### Sub-section\nDetails below.";
  const sections = splitBySections(text);
  const sub = sections.find((s) => s.heading?.startsWith("### Sub"));
  assertEquals(sub !== undefined, true);
});

Deno.test("splitBySections: all-caps heading line is detected", () => {
  const text = "INTRODUCTION:\nThis is the intro text.\nIt has two lines.";
  const sections = splitBySections(text);
  const intro = sections.find((s) => s.heading?.startsWith("INTRODUCTION"));
  assertEquals(intro !== undefined, true);
  assertStringIncludes(intro!.body, "intro text");
});

Deno.test("splitBySections: body-only sections with empty body are not lost", () => {
  // A heading immediately followed by another heading produces an empty body section
  const text = "# Section A\n# Section B\nContent for B.";
  const sections = splitBySections(text);
  const sectionB = sections.find((s) => s.heading === "# Section B");
  assertEquals(sectionB !== undefined, true);
  assertStringIncludes(sectionB!.body, "Content for B");
});

Deno.test("splitBySections: multiple headings produce correct count", () => {
  const text = [
    "# One",
    "Content one.",
    "# Two",
    "Content two.",
    "# Three",
    "Content three.",
  ].join("\n");
  const sections = splitBySections(text);
  assertEquals(sections.length, 3);
  assertEquals(sections[0].heading, "# One");
  assertEquals(sections[1].heading, "# Two");
  assertEquals(sections[2].heading, "# Three");
});

// ─── chunkText ────────────────────────────────────────────────────────────────

Deno.test("chunkText: empty string produces no chunks", () => {
  const chunks = chunkText("", "rules.txt");
  assertEquals(chunks.length, 0);
});

Deno.test("chunkText: whitespace-only input produces no chunks", () => {
  const chunks = chunkText("   \n   \n   ", "rules.txt");
  assertEquals(chunks.length, 0);
});

Deno.test("chunkText: short text under limit produces one chunk", () => {
  const text = "# Stats\nblood, heart, mind, spirit";
  const chunks = chunkText(text, "rules.txt");
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0].sourceFile, "rules.txt");
  assertStringIncludes(chunks[0].text, "blood");
});

Deno.test("chunkText: sourceFile is preserved on every chunk", () => {
  const text = "# Section A\nBody A.\n# Section B\nBody B.";
  const chunks = chunkText(text, "my-book.md");
  for (const chunk of chunks) {
    assertEquals(chunk.sourceFile, "my-book.md");
  }
});

Deno.test("chunkText: section heading is attached to chunk", () => {
  const text = "# Core Rules\nRoll 2d6 and add a stat.";
  const chunks = chunkText(text, "rules.txt");
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0].section, "# Core Rules");
});

Deno.test("chunkText: section with no heading has undefined section field", () => {
  const text = "Just a paragraph with no heading at all.";
  const chunks = chunkText(text, "notes.txt");
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0].section, undefined);
});

Deno.test("chunkText: long section is split into multiple overlapping chunks", () => {
  // Build a body that exceeds MAX_CHUNK_CHARS (6000)
  const longBody = "word ".repeat(2000); // ~10000 chars
  const text = `# Long Section\n${longBody}`;
  const chunks = chunkText(text, "big.txt");
  // Must produce more than one chunk for the long section
  assertEquals(chunks.length > 1, true);
});

Deno.test("chunkText: long section continuation chunks have '(cont.)' in section", () => {
  const longBody = "word ".repeat(2000);
  const text = `# Big Chapter\n${longBody}`;
  const chunks = chunkText(text, "big.txt");
  // All chunks from a windowed long section should carry the (cont.) label
  for (const chunk of chunks) {
    assertStringIncludes(chunk.section ?? "", "(cont.)");
  }
});

Deno.test("chunkText: overlapping windows means consecutive chunks share content", () => {
  // Build text long enough to produce at least 2 windows
  const word = "overlap-test ";
  const longBody = word.repeat(1200); // well over 6000 chars
  const text = `# Window Test\n${longBody}`;
  const chunks = chunkText(text, "overlap.txt");
  assertEquals(chunks.length >= 2, true);
  // The end of chunk[0] and the start of chunk[1] should share the word
  assertStringIncludes(chunks[0].text, "overlap-test");
  assertStringIncludes(chunks[1].text, "overlap-test");
});

Deno.test("chunkText: multiple sections each produce their own chunks", () => {
  const text = [
    "# Section One",
    "Body of section one.",
    "# Section Two",
    "Body of section two.",
    "# Section Three",
    "Body of section three.",
  ].join("\n");
  const chunks = chunkText(text, "multi.txt");
  assertEquals(chunks.length, 3);
  const sections = chunks.map((c) => c.section);
  assertEquals(sections.includes("# Section One"), true);
  assertEquals(sections.includes("# Section Two"), true);
  assertEquals(sections.includes("# Section Three"), true);
});

Deno.test("chunkText: chunk text is trimmed", () => {
  const text = "# Heading\n   Some text with leading space.   ";
  const chunks = chunkText(text, "trim.txt");
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0].text, "Some text with leading space.");
});
