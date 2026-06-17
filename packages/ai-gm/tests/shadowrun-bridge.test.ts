// ─── ai-gm × shadowrun bridge tests ──────────────────────────────────────────

import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { ISrRollEvent } from "../game-hooks-augment.ts";

// ─── formatSrRollNote (mirrored from hooks.ts for unit testing) ───────────────
// Testing the formatter logic in isolation — no KV, no gameHooks required.

function formatSrRollNote(e: ISrRollEvent): string {
  const edgeTag = e.edgeUsed ? " [Edge]" : "";
  const hitLine = e.threshold !== undefined
    ? `${e.hits} hits vs threshold ${e.threshold} — ${
      e.success ? "SUCCESS" : "FAIL"
    }`
    : `${e.hits} hits`;
  const glitchTag = e.critGlitch
    ? " CRITICAL GLITCH"
    : e.glitch
    ? " GLITCH"
    : "";
  return `[SR4 ROLL${edgeTag}] ${e.playerName}: ${e.pool} dice → ${hitLine}${glitchTag}`;
}

function makeRoll(overrides: Partial<ISrRollEvent> = {}): ISrRollEvent {
  return {
    playerId: "1",
    playerName: "Ghost",
    roomId: "5",
    pool: 10,
    hits: 4,
    glitch: false,
    critGlitch: false,
    edgeUsed: false,
    ...overrides,
  };
}

// ─── Roll note format ─────────────────────────────────────────────────────────

describe("formatSrRollNote (ai-gm side)", () => {
  it("full success — 4+ hits, threshold met", () => {
    const note = formatSrRollNote(
      makeRoll({ hits: 5, threshold: 4, success: true }),
    );
    assertStringIncludes(note, "SUCCESS");
    assertStringIncludes(note, "vs threshold 4");
  });

  it("partial success — 1-3 hits", () => {
    const note = formatSrRollNote(
      makeRoll({ hits: 2, threshold: 4, success: false }),
    );
    assertStringIncludes(note, "FAIL");
  });

  it("failure — 0 hits, no glitch", () => {
    const note = formatSrRollNote(makeRoll({ hits: 0, glitch: false }));
    assertStringIncludes(note, "0 hits");
    assertEquals(note.includes("GLITCH"), false);
  });

  it("glitch on failure", () => {
    const note = formatSrRollNote(makeRoll({ hits: 0, glitch: true }));
    assertStringIncludes(note, "GLITCH");
  });

  it("critical glitch overrides plain glitch label", () => {
    const note = formatSrRollNote(
      makeRoll({ hits: 0, glitch: true, critGlitch: true }),
    );
    assertStringIncludes(note, "CRITICAL GLITCH");
    // plain "GLITCH" should not appear without "CRITICAL" prefix
    assertEquals(note.replace("CRITICAL GLITCH", "").includes("GLITCH"), false);
  });

  it("no MUSH codes — safe for LLM injection", () => {
    const note = formatSrRollNote(
      makeRoll({ hits: 3, glitch: true, edgeUsed: true }),
    );
    assertEquals(
      /%./.test(note),
      false,
      "MUSH escape sequences must not appear in roll notes",
    );
  });

  it("note is under 200 chars — safe for round contribution poses[]", () => {
    const note = formatSrRollNote(
      makeRoll({
        pool: 20,
        hits: 10,
        threshold: 8,
        success: true,
        edgeUsed: true,
      }),
    );
    assertEquals(
      note.length < 200,
      true,
      `Note too long: ${note.length} chars`,
    );
  });
});

// ─── injectRollIntoRound logic ────────────────────────────────────────────────
// Test the contribution-patch logic in isolation with a mock round.

describe("injectRollIntoRound — contribution update logic", () => {
  function patchContribution(
    contributions: Array<{ playerId: string; poses: string[]; ready: boolean }>,
    playerId: string,
    note: string,
  ) {
    return contributions.map((c) =>
      c.playerId === playerId ? { ...c, poses: [...c.poses, note] } : c
    );
  }

  it("appends note to correct player's poses", () => {
    const contribs = [
      { playerId: "1", poses: ["Ghost hacks the node."], ready: false },
      { playerId: "2", poses: ["Razor covers the door."], ready: false },
    ];
    const updated = patchContribution(
      contribs,
      "1",
      "[SR4 ROLL] Ghost: 10 dice → 4 hits",
    );
    assertEquals(updated[0].poses.length, 2);
    assertStringIncludes(updated[0].poses[1], "SR4 ROLL");
    assertEquals(updated[1].poses.length, 1); // other player untouched
  });

  it("does NOT change ready state when injecting a roll", () => {
    const contribs = [{ playerId: "1", poses: [], ready: false }];
    const updated = patchContribution(
      contribs,
      "1",
      "[SR4 ROLL] Ghost: 8 dice → 2 hits",
    );
    assertEquals(
      updated[0].ready,
      false,
      "roll injection must not mark player as ready",
    );
  });

  it("no-op when player not in round contributions", () => {
    const contribs = [{ playerId: "2", poses: [], ready: false }];
    const updated = patchContribution(
      contribs,
      "99",
      "[SR4 ROLL] Ghost: 8 dice → 0 hits",
    );
    assertEquals(updated[0].poses.length, 0);
  });

  it("multiple rolls accumulate in poses[]", () => {
    const initial = [{ playerId: "1", poses: [] as string[], ready: false }];
    const after1 = patchContribution(
      initial,
      "1",
      "[SR4 ROLL] Ghost: 8 dice → 3 hits",
    );
    const after2 = patchContribution(
      after1,
      "1",
      "[SR4 ROLL] Ghost: 6 dice → 1 hits GLITCH",
    );
    assertEquals(after2[0].poses.length, 2);
  });
});
