/**
 * Path validation for wiki admin create (mirrors admin/app.js).
 */
import { assertEquals } from "@std/assert";

const PATH_RE = /^[a-z0-9]+(?:[/_-][a-z0-9]+)*$/;

function normalizePath(raw: string): string {
  return raw
    .trim()
    .replace(/\.md$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function isValidPath(path: string): boolean {
  if (!path || path.includes("..")) return false;
  return PATH_RE.test(path);
}

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("normalizePath strips .md and slashes", OPTS, () => {
  assertEquals(normalizePath(" Lore/Factions.MD "), "lore/factions");
  assertEquals(normalizePath("/rules/"), "rules");
});

Deno.test("isValidPath accepts slug paths", OPTS, () => {
  assertEquals(isValidPath("home"), true);
  assertEquals(isValidPath("lore/factions"), true);
  assertEquals(isValidPath("a_b-c/d"), true);
});

Deno.test("isValidPath rejects bad paths", OPTS, () => {
  assertEquals(isValidPath(""), false);
  assertEquals(isValidPath("../etc"), false);
  assertEquals(isValidPath("Has Space"), false);
  assertEquals(isValidPath("UPPER"), false);
  assertEquals(isValidPath("/abs"), false);
});
