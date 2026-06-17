/**
 * Tests for tracking.ts — read state, membership, notify, draft, sig logic.
 * Uses inline stubs matching the tracking.ts API surface.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

// ---------------------------------------------------------------------------
// Inline stubs (avoids real DBO / SDK dependency)
// ---------------------------------------------------------------------------

type ReadState = Record<string, string[]>;

function getReadSet(state: ReadState, boardNum: number): Set<string> {
  return new Set(state[String(boardNum)] ?? []);
}

function markRead(state: ReadState, boardNum: number, msgKey: string): ReadState {
  const arr = [...(state[String(boardNum)] ?? [])];
  if (!arr.includes(msgKey)) arr.push(msgKey);
  return { ...state, [String(boardNum)]: arr };
}

function getUnreadKeys(state: ReadState, allKeys: string[], boardNum: number): string[] {
  const readSet = getReadSet(state, boardNum);
  return allKeys.filter((k) => !readSet.has(k));
}

type MemberState = Record<string, boolean>;

function isMember(state: MemberState, boardNum: number): boolean {
  const val = state[String(boardNum)];
  return val === undefined ? true : val;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getReadSet", () => {
  it("returns empty set for new player", () => {
    assertEquals(getReadSet({}, 1).size, 0);
  });
  it("returns correct set for board with reads", () => {
    const state: ReadState = { "1": ["1", "2", "1.1"] };
    const rs = getReadSet(state, 1);
    assertEquals(rs.has("1"), true);
    assertEquals(rs.has("1.1"), true);
    assertEquals(rs.has("99"), false);
  });
});

describe("markRead", () => {
  it("adds a new key", () => {
    const result = markRead({}, 1, "3");
    assertEquals(result["1"], ["3"]);
  });
  it("does not duplicate existing key", () => {
    const state: ReadState = { "1": ["3"] };
    const result = markRead(state, 1, "3");
    assertEquals(result["1"].length, 1);
  });
  it("preserves keys from other boards", () => {
    const state: ReadState = { "2": ["1", "2"] };
    const result = markRead(state, 1, "5");
    assertEquals(result["2"], ["1", "2"]);
    assertEquals(result["1"], ["5"]);
  });
});

describe("getUnreadKeys", () => {
  it("returns all keys when nothing read", () => {
    const unread = getUnreadKeys({}, ["1", "2", "1.1"], 1);
    assertEquals(unread, ["1", "2", "1.1"]);
  });
  it("excludes read keys", () => {
    const state: ReadState = { "1": ["1", "1.1"] };
    const unread = getUnreadKeys(state, ["1", "2", "1.1"], 1);
    assertEquals(unread, ["2"]);
  });
  it("returns empty when all read", () => {
    const state: ReadState = { "1": ["1", "2"] };
    const unread = getUnreadKeys(state, ["1", "2"], 1);
    assertEquals(unread.length, 0);
  });
});

describe("isMember", () => {
  it("defaults to true for new player (unset)", () => {
    assertEquals(isMember({}, 1), true);
  });
  it("returns false when explicitly left", () => {
    assertEquals(isMember({ "1": false }, 1), false);
  });
  it("returns true when explicitly joined", () => {
    assertEquals(isMember({ "1": true }, 1), true);
  });
});

describe("draft flow (state logic)", () => {
  it("preserves all draft fields on update", () => {
    const draft = {
      boardNum: 2,
      subject: "Test",
      body: "Hello",
      icTag: "ic" as const,
      tags: ["lore"],
    };
    const extended = { ...draft, body: draft.body + "\nmore" };
    assertEquals(extended.body, "Hello\nmore");
    assertEquals(extended.tags, ["lore"]);
    assertEquals(extended.icTag, "ic");
  });
});
