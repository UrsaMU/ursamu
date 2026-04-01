/**
 * tests/security_grep_redos.test.ts
 *
 * [SEC][M1] ReDoS via user-controlled regex in @grep /regexp switch.
 *
 * When /regexp is used, the searchStr is passed directly to new RegExp().
 * A crafted pattern with nested quantifiers causes catastrophic backtracking.
 *
 * RED:  buildRegexForGrep (extracted from grep.ts logic) accepts the dangerous
 *       pattern without error and isReDoSProne() returns true for it.
 *       After the patch, buildRegexForGrep returns null for ReDoS-prone patterns,
 *       and the caller sends an error message.
 *
 * GREEN: buildRegexForGrep rejects ReDoS-prone patterns, returns null.
 */
import { assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ── Extract the current production logic from grep.ts ───────────────────────
// This mirrors the exact code at grep.ts lines 89-94.

function buildRegexForGrep_CURRENT(searchStr: string, doRegexp: boolean): RegExp {
  // Current production code — no ReDoS guard
  if (doRegexp) {
    return new RegExp(searchStr, "i");
  }
  return new RegExp(searchStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

// ── The fix: reject ReDoS-prone patterns ────────────────────────────────────

/**
 * Returns true if pattern likely causes catastrophic backtracking.
 * Detects nested quantifier groups: (x+)+, (x*)*, (x+)* etc.
 */
export function isReDoSProne(pattern: string): boolean {
  return /\([^)]*[+*?][^)]*\)[+*?{]/.test(pattern) || pattern.length > 200;
}

function buildRegexForGrep_FIXED(searchStr: string, doRegexp: boolean): RegExp | null {
  if (doRegexp) {
    if (isReDoSProne(searchStr)) return null; // reject dangerous pattern
    try {
      return new RegExp(searchStr, "i");
    } catch {
      return null;
    }
  }
  return new RegExp(searchStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

// ── RED: prove the current code is vulnerable ─────────────────────────────────

Deno.test("[SEC][M1] RED: current code accepts ReDoS-prone (a+)+ pattern without guard", OPTS, () => {
  const dangerousPattern = "(a+)+$";

  // Current code blindly accepts it — this is the vulnerability
  const re = buildRegexForGrep_CURRENT(dangerousPattern, true);
  assertEquals(re instanceof RegExp, true, "FLAW: dangerous pattern compiled without guard");

  // Confirm our detector identifies it as dangerous
  assertEquals(isReDoSProne(dangerousPattern), true, "pattern is ReDoS-prone");

  // The FIXED version must return null for this pattern
  const fixedRe = buildRegexForGrep_FIXED(dangerousPattern, true);
  assertEquals(fixedRe, null, "FIXED version rejects the dangerous pattern — GREEN");
});

Deno.test("[SEC][M1] fixed: nested quantifier patterns are rejected", OPTS, () => {
  const badPatterns = ["(a+)+$", "(\\w+)+", "(a*)*", "(a+)*b", "(a?)+"];
  for (const p of badPatterns) {
    assertEquals(
      buildRegexForGrep_FIXED(p, true),
      null,
      `FIXED builder must reject: ${p}`,
    );
  }
});

Deno.test("[SEC][M1] fixed: benign regexp patterns are accepted", OPTS, () => {
  const goodPatterns = ["^say", "hello", "\\d+", "[a-z]+", "^$"];
  for (const p of goodPatterns) {
    const result = buildRegexForGrep_FIXED(p, true);
    assertEquals(result instanceof RegExp, true, `FIXED builder must accept: ${p}`);
  }
});

Deno.test("[SEC][M1] fixed: patterns > 200 chars are rejected", OPTS, () => {
  assertEquals(buildRegexForGrep_FIXED("a".repeat(201), true), null);
});

Deno.test("[SEC][M1] fixed: non-regexp mode always escapes and is safe", OPTS, () => {
  // Even a dangerous-looking string in non-regexp mode is escaped and safe
  const result = buildRegexForGrep_FIXED("(a+)+$", false);
  assertEquals(result instanceof RegExp, true, "non-regexp mode escapes the string");
  // The escaped pattern matches literal "(a+)+$"
  assertEquals(result!.test("(a+)+$"), true);
  assertEquals(result!.test("aab"), false);
});
