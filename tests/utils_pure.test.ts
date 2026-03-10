/**
 * tests/utils_pure.test.ts
 *
 * Tests for pure utility functions that have no database dependency.
 * Covers: splitArgs (src/utils/splitArgs.ts) and capString (src/utils/capString.ts).
 */
import { assertEquals } from "@std/assert";
import { splitArgs } from "../src/utils/splitArgs.ts";
import { capString } from "../src/utils/capString.ts";

// ---------------------------------------------------------------------------
// splitArgs
// ---------------------------------------------------------------------------

Deno.test("splitArgs utility", async (t) => {
  await t.step("basic comma split", () => {
    const result = splitArgs("a,b,c");
    assertEquals(result, ["a", "b", "c"]);
  });

  await t.step("single item (no separator)", () => {
    const result = splitArgs("hello");
    assertEquals(result, ["hello"]);
  });

  await t.step("empty string yields one empty element", () => {
    const result = splitArgs("");
    assertEquals(result, [""]);
  });

  await t.step("respects paren depth — does not split inside ()", () => {
    const result = splitArgs("add(a,b),c");
    assertEquals(result, ["add(a,b)", "c"]);
  });

  await t.step("respects square-bracket depth — does not split inside []", () => {
    const result = splitArgs("a[1,2],b");
    assertEquals(result, ["a[1,2]", "b"]);
  });

  await t.step("respects brace depth — does not split inside {}", () => {
    const result = splitArgs("{a,b},c");
    assertEquals(result, ["{a,b}", "c"]);
  });

  await t.step("escaped separator with % is kept as literal, not split", () => {
    // '%,' in splitArgs escapes the next char so '%,' becomes part of current token
    const result = splitArgs("a%,b,c");
    assertEquals(result, ["a%,b", "c"]);
  });

  await t.step("custom separator — equals sign", () => {
    const result = splitArgs("a=b=c", "=");
    assertEquals(result, ["a", "b", "c"]);
  });

  await t.step("nested mixed brackets — fn(a[1,2],b),c", () => {
    const result = splitArgs("fn(a[1,2],b),c");
    assertEquals(result, ["fn(a[1,2],b)", "c"]);
  });

  await t.step("multiple consecutive commas produce empty strings between them", () => {
    const result = splitArgs("a,,b");
    assertEquals(result, ["a", "", "b"]);
  });

  await t.step("leading comma produces empty first element", () => {
    const result = splitArgs(",b");
    assertEquals(result, ["", "b"]);
  });

  await t.step("trailing comma produces empty last element", () => {
    const result = splitArgs("a,");
    assertEquals(result, ["a", ""]);
  });

  await t.step("deeply nested parens — does not split at any inner comma", () => {
    const result = splitArgs("outer(inner(a,b),c),d");
    assertEquals(result, ["outer(inner(a,b),c)", "d"]);
  });

  await t.step("custom separator — pipe", () => {
    const result = splitArgs("x|y|z", "|");
    assertEquals(result, ["x", "y", "z"]);
  });

  await t.step("escaped separator with backslash keeps the chars", () => {
    // '\\,' also escapes with backslash
    const result = splitArgs("a\\,b,c");
    assertEquals(result, ["a\\,b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// capString
// ---------------------------------------------------------------------------

Deno.test("capString utility", async (t) => {
  await t.step("capitalises first letter of a single word", () => {
    assertEquals(capString("hello"), "Hello");
  });

  await t.step("capitalises first letter of each word in a multi-word string", () => {
    assertEquals(capString("hello world"), "Hello World");
  });

  await t.step("already-capitalised string remains unchanged", () => {
    assertEquals(capString("Hello"), "Hello");
  });

  await t.step("already-capitalised multi-word string remains unchanged", () => {
    assertEquals(capString("Hello World"), "Hello World");
  });

  await t.step("word starting with '(' capitalises the letter after the paren", () => {
    assertEquals(capString("(hello)"), "(Hello)");
  });

  await t.step("mixed: normal word and paren-prefixed word", () => {
    assertEquals(capString("hello (world) foo"), "Hello (World) Foo");
  });

  await t.step("empty string returns empty string", () => {
    assertEquals(capString(""), "");
  });

  await t.step("all-lowercase multi-word sentence", () => {
    assertEquals(capString("the quick brown fox"), "The Quick Brown Fox");
  });

  await t.step("single character word", () => {
    assertEquals(capString("a"), "A");
  });

  await t.step("multiple paren-prefixed words", () => {
    assertEquals(capString("(alpha) (beta) (gamma)"), "(Alpha) (Beta) (Gamma)");
  });

  await t.step("mixed case input — only first char of each word changes", () => {
    // capString only touches charAt(0); the rest of the word is preserved as-is
    assertEquals(capString("hELLO wORLD"), "HELLO WORLD");
  });

  await t.step("word with number prefix — first char is a digit, no case change", () => {
    assertEquals(capString("3rd place"), "3rd Place");
  });
});
