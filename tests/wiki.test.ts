import {
  assertEquals,
} from "https://deno.land/std@0.220.0/assert/mod.ts";
import { parseFrontmatter, serializePage, walkWiki } from "../src/plugins/wiki/router.ts";
import { join } from "@std/path";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ─── parseFrontmatter ─────────────────────────────────────────────────────────

Deno.test("parseFrontmatter — full frontmatter block", OPTS, () => {
  const raw = `---
title: Battle for the City
date: 2026-03-18
author: Alice
tags: [news, combat]
sticky: true
views: 42
---

Content here.`;

  const { meta, body } = parseFrontmatter(raw);
  assertEquals(meta.title,   "Battle for the City");
  assertEquals(meta.date,    "2026-03-18");
  assertEquals(meta.author,  "Alice");
  assertEquals(meta.tags,    ["news", "combat"]);
  assertEquals(meta.sticky,  true);
  assertEquals(meta.views,   42);
  assertEquals(body,         "Content here.");
});

Deno.test("parseFrontmatter — no frontmatter", OPTS, () => {
  const { meta, body } = parseFrontmatter("Just plain text.");
  assertEquals(meta,  {});
  assertEquals(body,  "Just plain text.");
});

Deno.test("parseFrontmatter — empty tags array", OPTS, () => {
  const { meta } = parseFrontmatter("---\ntags: []\n---\nbody");
  assertEquals(meta.tags, []);
});

// ─── serializePage ────────────────────────────────────────────────────────────

Deno.test("serializePage — round-trips frontmatter + body", OPTS, () => {
  const meta = { title: "My Page", sticky: true, tags: ["news", "lore"] };
  const body = "Hello world.";
  const serialized = serializePage(meta, body);

  const { meta: m2, body: b2 } = parseFrontmatter(serialized);
  assertEquals(m2.title,  "My Page");
  assertEquals(m2.sticky, true);
  assertEquals(m2.tags,   ["news", "lore"]);
  assertEquals(b2,        "Hello world.");
});

Deno.test("serializePage — skips null/undefined values", OPTS, () => {
  const meta = { title: "Test", empty: undefined, nothing: null };
  const serialized = serializePage(meta as Record<string, unknown>, "body");
  assertEquals(serialized.includes("empty"), false);
  assertEquals(serialized.includes("nothing"), false);
});

// ─── walkWiki ─────────────────────────────────────────────────────────────────

Deno.test("walkWiki — finds .md files and maps to URL paths", OPTS, async () => {
  const tmp = await Deno.makeTempDir();

  await Deno.mkdir(join(tmp, "news"));
  await Deno.mkdir(join(tmp, "lore"));
  await Deno.writeTextFile(join(tmp, "news", "battle.md"), "---\ntitle: Battle\n---\nbody");
  await Deno.writeTextFile(join(tmp, "lore", "index.md"), "---\ntitle: Lore\n---\nbody");
  await Deno.writeTextFile(join(tmp, "README.md"), "ignored");

  const results: string[] = [];
  for await (const { urlPath } of walkWiki(tmp)) {
    results.push(urlPath);
  }

  assertEquals(results.includes("news/battle"), true);
  assertEquals(results.includes("lore"),        true,  "index.md should map to its parent dir");
  assertEquals(results.includes("README"),      false, "README.md should be excluded");
  assertEquals(results.length, 2);

  await Deno.remove(tmp, { recursive: true });
});

Deno.test("walkWiki — empty dir yields nothing", OPTS, async () => {
  const tmp = await Deno.makeTempDir();
  const results: string[] = [];
  for await (const { urlPath } of walkWiki(tmp)) results.push(urlPath);
  assertEquals(results.length, 0);
  await Deno.remove(tmp, { recursive: true });
});

Deno.test("walkWiki — non-existent dir yields nothing", OPTS, async () => {
  const results: string[] = [];
  for await (const e of walkWiki("/tmp/does-not-exist-ursamu-wiki")) results.push(e.urlPath);
  assertEquals(results.length, 0);
});
