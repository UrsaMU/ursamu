import {
  assertEquals,
  assertStringIncludes,
  assertLessOrEqual,
} from "@std/assert";
import {
  markdownToDiscord,
  truncateDiscord,
  embedForEntry,
  embedForIndex,
  embedForSection,
  embedNotFound,
} from "../src/help-embed.ts";
import type { HelpEntry } from "@ursamu/help";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("markdownToDiscord strips MUSH and frontmatter", OPTS, () => {
  const md = `---
dark: true
---
# Title
%ch%cyBold%cn line
`;
  const out = markdownToDiscord(md);
  assertStringIncludes(out, "**Title**");
  assertEquals(out.includes("%ch"), false);
  assertEquals(out.includes("---"), false);
});

Deno.test("truncateDiscord appends marker when over max", OPTS, () => {
  const long = "x".repeat(5000);
  const out = truncateDiscord(long, 100);
  assertLessOrEqual(out.length, 100);
  assertStringIncludes(out, "truncated");
});

Deno.test("truncateDiscord leaves short text alone", OPTS, () => {
  assertEquals(truncateDiscord("hi", 100), "hi");
});

Deno.test("embedForEntry builds title and description", OPTS, () => {
  const entry: HelpEntry = {
    name: "bbpost",
    section: "bbs",
    source: "file",
    content: "# BBPOST\n\nPost to a board.",
    hidden: false,
  };
  const emb = embedForEntry(entry);
  assertEquals(emb.title, "bbpost");
  assertStringIncludes(String(emb.description), "Post to a board");
  assertStringIncludes(String(emb.footer?.text), "bbs");
});

Deno.test("embedForIndex lists sections", OPTS, () => {
  const emb = embedForIndex(["bbs", "channels"], 12);
  assertStringIncludes(String(emb.description), "`bbs`");
  assertStringIncludes(String(emb.description), "12");
});

Deno.test("embedForSection lists topic names", OPTS, () => {
  const entries: HelpEntry[] = [
    {
      name: "bbpost",
      section: "bbs",
      source: "file",
      content: "",
      hidden: false,
    },
    {
      name: "hidden-one",
      section: "bbs",
      source: "file",
      content: "",
      hidden: true,
    },
  ];
  const emb = embedForSection("bbs", entries);
  assertStringIncludes(String(emb.description), "bbpost");
  assertEquals(String(emb.description).includes("hidden-one"), false);
});

Deno.test("embedNotFound mentions topic", OPTS, () => {
  const emb = embedNotFound("nope");
  assertStringIncludes(String(emb.description), "nope");
});
