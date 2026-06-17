/**
 * SECURITY — M2: frontmatter array parser mangles values containing commas.
 *
 * The naive split(",") splits BEFORE quotes are stripped, so a value like
 * `["New York, NY", "Los Angeles"]` becomes `['"New York', 'NY"', 'Los Angeles']`.
 * This is data loss/corruption, not injection — but must be fixed before any
 * tag/category values could contain commas (faction names, locations, etc.).
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { parseFrontmatter, serializePage } from "../src/fs.ts";

describe("parseFrontmatter — array values with commas", () => {
  it("EXPLOIT: quoted value with comma is not split", () => {
    const raw = `---\ntags: ["New York, NY", "Los Angeles"]\n---\nBody`;
    const { meta } = parseFrontmatter(raw);
    // Currently fails: split on comma produces '"New York', ' NY"', 'Los Angeles'
    assertEquals(meta.tags, ["New York, NY", "Los Angeles"]);
  });

  it("EXPLOIT: single-quoted value with comma is not split", () => {
    const raw = `---\ntags: ['a,b', 'c']\n---\nBody`;
    const { meta } = parseFrontmatter(raw);
    assertEquals(meta.tags, ["a,b", "c"]);
  });

  it("PATCH: unquoted values without commas still parse correctly", () => {
    const raw = `---\ntags: [lore, ic, factions]\n---\nBody`;
    const { meta } = parseFrontmatter(raw);
    assertEquals(meta.tags, ["lore", "ic", "factions"]);
  });

  it("PATCH: empty array still parses as empty", () => {
    const raw = `---\ntags: []\n---\nBody`;
    const { meta } = parseFrontmatter(raw);
    assertEquals(meta.tags, []);
  });

  it("PATCH: round-trip for tags containing commas", () => {
    const meta = { title: "Test", tags: ["New York, NY", "Los Angeles"] };
    const body = "Body";
    const serialized = serializePage(meta, body);
    const { meta: parsed } = parseFrontmatter(serialized);
    assertEquals(parsed.tags, ["New York, NY", "Los Angeles"]);
  });
});
