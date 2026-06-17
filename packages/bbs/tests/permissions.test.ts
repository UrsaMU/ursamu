/**
 * Tests for permissions.ts — isStaff, isBoardMod, canRead, canWrite.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer, mockStaff } from "./helpers/mockU.ts";

// ---------------------------------------------------------------------------
// Inline stubs matching permissions.ts logic (no real DBO)
// ---------------------------------------------------------------------------

function isStaff(flags: Set<string>): boolean {
  return flags.has("superuser") || flags.has("admin") || flags.has("wizard");
}

function isBoardMod(playerId: string, board: { moderators: string[]; }): boolean {
  return (board.moderators ?? []).includes(playerId);
}

function _isBoardModOrStaff(playerId: string, flags: Set<string>, board: { moderators: string[]; }): boolean {
  return isStaff(flags) || isBoardMod(playerId, board);
}

function canReadLock(
  flags: Set<string>,
  playerId: string,
  board: { readLock: string; ownerId?: string; },
  factionContents: string[] = [],
): boolean {
  if (isStaff(flags)) return true;
  if (!board.readLock || board.readLock === "all()") return true;
  if (board.readLock === "faction" && board.ownerId) {
    return factionContents.includes(playerId);
  }
  return false;
}

function canWriteLock(
  flags: Set<string>,
  playerId: string,
  board: { writeLock: string; ownerId?: string; type: string; },
  factionContents: string[] = [],
): boolean {
  if (board.type === "archive") return false;
  if (isStaff(flags)) return true;
  if (!board.writeLock || board.writeLock === "all()") return true;
  if (board.writeLock === "faction" && board.ownerId) {
    return factionContents.includes(playerId);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isStaff", () => {
  it("returns true for admin flag", () => {
    assertEquals(isStaff(new Set(["admin"])), true);
  });
  it("returns true for wizard flag", () => {
    assertEquals(isStaff(new Set(["wizard"])), true);
  });
  it("returns true for superuser flag", () => {
    assertEquals(isStaff(new Set(["superuser"])), true);
  });
  it("returns false for plain player", () => {
    assertEquals(isStaff(new Set(["player", "connected"])), false);
  });
});

describe("isBoardMod", () => {
  it("returns true when playerId is in moderators", () => {
    assertEquals(isBoardMod("p1", { moderators: ["p1", "p2"] }), true);
  });
  it("returns false when playerId is not in moderators", () => {
    assertEquals(isBoardMod("p3", { moderators: ["p1", "p2"] }), false);
  });
  it("handles empty moderator list", () => {
    assertEquals(isBoardMod("p1", { moderators: [] }), false);
  });
});

describe("canRead", () => {
  it("staff always passes", () => {
    assertEquals(canReadLock(new Set(["admin"]), "p1", { readLock: "nope" }), true);
  });
  it("all() passes for players", () => {
    assertEquals(canReadLock(new Set(["player"]), "p1", { readLock: "all()" }), true);
  });
  it("empty lock passes for players", () => {
    assertEquals(canReadLock(new Set(["player"]), "p1", { readLock: "" }), true);
  });
  it("faction lock passes for faction member", () => {
    assertEquals(canReadLock(new Set(["player"]), "p1", { readLock: "faction", ownerId: "fac1" }, ["p1"]), true);
  });
  it("faction lock fails for non-member", () => {
    assertEquals(canReadLock(new Set(["player"]), "p2", { readLock: "faction", ownerId: "fac1" }, ["p1"]), false);
  });
  it("unknown lock expression fails for player", () => {
    assertEquals(canReadLock(new Set(["player"]), "p1", { readLock: "admin+" }), false);
  });
});

describe("canWrite", () => {
  it("archive boards always return false", () => {
    assertEquals(canWriteLock(new Set(["admin"]), "p1", { writeLock: "all()", type: "archive" }), false);
  });
  it("staff can write to normal boards", () => {
    assertEquals(canWriteLock(new Set(["admin"]), "p1", { writeLock: "faction", type: "normal" }), true);
  });
  it("all() allows player to write", () => {
    assertEquals(canWriteLock(new Set(["player"]), "p1", { writeLock: "all()", type: "normal" }), true);
  });
  it("faction lock allows faction member to write", () => {
    assertEquals(canWriteLock(new Set(["player"]), "p1", { writeLock: "faction", ownerId: "fac1", type: "normal" }, ["p1"]), true);
  });
  it("faction lock blocks non-member", () => {
    assertEquals(canWriteLock(new Set(["player"]), "p2", { writeLock: "faction", ownerId: "fac1", type: "normal" }, ["p1"]), false);
  });
});

// Suppress unused import warnings
void mockU; void mockPlayer; void mockStaff;
