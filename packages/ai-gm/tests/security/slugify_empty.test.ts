// ─── EXPLOIT: Slugify Empty System ID ────────────────────────────────────────
//
// VULNERABILITY: ingestion/reviewer.ts slugify() returns "" for inputs that
//   contain only non-alphanumeric characters (e.g., "---", "!!!", "   ").
//   The result is used as a system ID in commitSystem():
//     id: slugify(draft.gameName)
//
// EXPLOIT: If an AI-ingested game name is "---" or purely symbolic (e.g., a
//   game called "???" in metadata), the system is stored with id="" in the DB.
//   This:
//   1. Allows overwriting any existing system with id="" (collision)
//   2. Causes the config systemId to be set to "" which likely breaks lookup
//   3. Could allow crafted book text to force a blank system ID via prompt injection
//      of game name in the extraction phase
//
// Red phase: these tests FAIL before the fix (empty slug is returned/accepted).
// Green phase: these tests PASS after the fix (empty slug is rejected).

import { assert, assertNotEquals } from "@std/assert";
import { slugify } from "../../ingestion/reviewer.ts";

Deno.test("SECURITY: slugify must not return empty string for special-char-only input", () => {
  const result = slugify("---");
  assertNotEquals(
    result,
    "",
    `BUG: slugify("---") returned "" — empty system ID would break registry`,
  );
});

Deno.test("SECURITY: slugify must not return empty string for whitespace-only input", () => {
  const result = slugify("   ");
  assertNotEquals(
    result,
    "",
    `BUG: slugify("   ") returned "" — empty system ID would break registry`,
  );
});

Deno.test("SECURITY: slugify must not return empty string for unicode-only input", () => {
  const result = slugify("★☆♠♣");
  assertNotEquals(
    result,
    "",
    `BUG: slugify("★☆♠♣") returned "" — unicode game name produces empty system ID`,
  );
});

Deno.test("SECURITY: slugify must not return empty string for pure punctuation", () => {
  const result = slugify("!!! @@@");
  assertNotEquals(
    result,
    "",
    `BUG: slugify("!!! @@@") returned "" — punctuation-only game name breaks system ID`,
  );
});

Deno.test("SECURITY: slugify result must be a valid non-empty identifier", () => {
  const cases = ["---", "   ", "!!!", "★★★", "🎲🎲🎲", ""];
  for (const input of cases) {
    const result = slugify(input);
    assertNotEquals(
      result.length,
      0,
      `BUG: slugify(${JSON.stringify(input)}) returned empty string`,
    );
    // Result must match slug pattern
    assert(
      /^[a-z0-9-]+$/.test(result),
      `BUG: slugify(${JSON.stringify(input)}) returned non-slug: "${result}"`,
    );
  }
});
