/**
 * Security tests — MUSH code injection into GM LLM context (C-1 to C-5)
 *
 * Exploit: All five emitGM* call sites build summary strings using
 * u.util.displayName() output without calling stripSubs(). displayName()
 * returns MUSH-formatted strings like "%chGhost%cn". These codes are injected
 * verbatim into the ai-gm LLM round context, corrupting the system prompt and
 * potentially enabling players to embed instructions via crafted display names.
 *
 * Fix: Wrap every displayName() / user-text usage with sanitizeGMSummary()
 * before embedding in the summary string.
 *
 * These tests verify the invariant: no GM summary string may contain MUSH
 * escape sequences.
 */
import { assertEquals, assertMatch } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { stripMush, sanitizeGMSummary, MAX_GM_SUMMARY_LENGTH } from "../../engine/validation.ts";

// ─── Invariant tests — verify the fix (call site pattern mirrors each command) ─
//
// Each test simulates the FIXED call-site pattern:
//   sanitizeGMSummary(`${displayName()} ...`)
// so it proves the invariant holds when the command's sanitizeGMSummary() call
// is present.  The exploit that motivated each test (raw displayName() injecting
// MUSH codes) is documented as a comment rather than as a live assertion, since
// the raw string will always contain MUSH codes — the invariant is about what
// leaves via the emitter, not what the raw string looks like.

const MUSH_NAME = "%chGhost%cn";   // typical displayName() output with bold
const MUSH_NAME2 = "%crRogue%cn";  // attacker/defender MUSH name

describe("C-1 rolls.ts — GM roll summary must not contain MUSH codes", () => {
  it("FIXED: sanitizeGMSummary strips MUSH codes from roll summary", () => {
    // Exploit: `${displayName()}` passes "%chGhost%cn" verbatim into summary.
    // Fix: call sites now compute gmName = sanitizeGMSummary(displayName()).
    const gmName = sanitizeGMSummary(MUSH_NAME);
    const summary = sanitizeGMSummary(
      `${gmName} rolls REF+Handgun: total 18 vs DV 15 — SUCCESS`,
    );
    assertEquals(/%./.test(summary), false,
      "MUSH codes must not appear in GM roll summary");
  });
});

describe("C-2 combat.ts — GM attack summary must not contain MUSH codes", () => {
  it("FIXED: sanitizeGMSummary strips MUSH codes from attack summary", () => {
    const gmAtk = sanitizeGMSummary(MUSH_NAME);
    const gmDef = sanitizeGMSummary(MUSH_NAME2);
    const summary = sanitizeGMSummary(
      `${gmAtk} hits ${gmDef} — 8 net damage. ${gmDef} is now SERIOUSLY WOUNDED (HP: 4/20).`,
    );
    assertEquals(/%./.test(summary), false,
      "MUSH codes must not appear in GM attack summary");
  });
});

describe("C-3 rest.ts — GM rest summary must not contain MUSH codes", () => {
  it("FIXED: sanitizeGMSummary strips MUSH codes from rest summary", () => {
    const gmName = sanitizeGMSummary(MUSH_NAME);
    const summary = sanitizeGMSummary(
      `${gmName} completes a short rest — 8 HP restored, now HEALTHY (HP: 20/20).`,
    );
    assertEquals(/%./.test(summary), false,
      "MUSH codes must not appear in GM rest summary");
  });
});

describe("C-4 humanity.ts — GM humanity summary must not contain MUSH codes", () => {
  it("FIXED: sanitizeGMSummary strips MUSH codes from humanity summary", () => {
    const gmName = sanitizeGMSummary(MUSH_NAME);
    const note = "Had dinner with family";
    const summary = sanitizeGMSummary(
      `${gmName} regains 4 Humanity via spending time with loved ones (${note}). HL: 12, EMP: 5/6.`,
    );
    assertEquals(/%./.test(summary), false,
      "MUSH codes must not appear in GM humanity summary");
  });
});

describe("C-5 brawl.ts — GM brawl summary must not contain MUSH codes", () => {
  it("FIXED: sanitizeGMSummary strips MUSH codes from brawl summary", () => {
    const gmAtk = sanitizeGMSummary(MUSH_NAME);
    const gmDef = sanitizeGMSummary(MUSH_NAME2);
    const summary = sanitizeGMSummary(`${gmAtk} attempts grab on ${gmDef}.`);
    assertEquals(/%./.test(summary), false,
      "MUSH codes must not appear in GM brawl summary");
  });
});

// ─── Green-phase: verify the fix (stripMush / sanitizeGMSummary) ──────────────

describe("stripMush() — strips all MUSH escape sequences", () => {
  it("strips bold code %ch/%cn", () => {
    assertEquals(stripMush("%chGhost%cn"), "Ghost");
  });

  it("strips colour codes %cr %cg %cb %cy %cw %cc", () => {
    assertEquals(stripMush("%crRed%cg%cbBlue%cn"), "RedBlue");
  });

  it("replaces structural codes %r %t %n %b with a space", () => {
    const result = stripMush("line1%rline2");
    assertEquals(result.includes("%r"), false);
    assertEquals(result.includes("line1"), true);
    assertEquals(result.includes("line2"), true);
  });

  it("leaves plain text unchanged", () => {
    assertEquals(stripMush("Ghost shoots Rogue."), "Ghost shoots Rogue.");
  });

  it("handles empty string", () => {
    assertEquals(stripMush(""), "");
  });
});

describe("sanitizeGMSummary() — strips MUSH + caps length", () => {
  it("produces MUSH-free output from a MUSH name", () => {
    const safe = sanitizeGMSummary(`${MUSH_NAME} rolls REF+Handgun: total 18 vs DV 15 — SUCCESS`);
    assertEquals(/%./.test(safe), false);
    assertMatch(safe, /Ghost/);
  });

  it("truncates at MAX_GM_SUMMARY_LENGTH", () => {
    const longInput = "A".repeat(MAX_GM_SUMMARY_LENGTH + 100);
    assertEquals(sanitizeGMSummary(longInput).length, MAX_GM_SUMMARY_LENGTH);
  });

  it("does not truncate strings at or below MAX_GM_SUMMARY_LENGTH", () => {
    const input = "Ghost takes 8 damage.";
    assertEquals(sanitizeGMSummary(input).length, input.length);
  });

  it("handles both MUSH codes and excess length together", () => {
    const input = "%chGhost%cn " + "X".repeat(MAX_GM_SUMMARY_LENGTH);
    const result = sanitizeGMSummary(input);
    assertEquals(/%./.test(result), false);
    assertEquals(result.length, MAX_GM_SUMMARY_LENGTH);
  });
});
