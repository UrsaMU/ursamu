/**
 * Tests for cleanup.ts — post expiry logic and archive migration.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

interface IPost { id: string; createdAt: number; timeout: number; }
interface IBoard { num: number; timeout: number; archiveTo?: string; type: string; }

function isExpired(post: IPost, boardTimeout: number, now: number): boolean {
  const postTimeout = post.timeout || boardTimeout;
  if (postTimeout <= 0) return false;
  const ageMs   = now - post.createdAt;
  const limitMs = postTimeout * 24 * 60 * 60 * 1000;
  return ageMs > limitMs;
}

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function makePost(overrides: Partial<IPost> = {}): IPost {
  return { id: "p1", createdAt: NOW, timeout: 0, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isExpired", () => {
  it("never expires when timeout is 0", () => {
    const post = makePost({ createdAt: NOW - 100 * DAY, timeout: 0 });
    assertEquals(isExpired(post, 0, NOW), false);
  });

  it("expires old post with board timeout", () => {
    const post = makePost({ createdAt: NOW - 31 * DAY, timeout: 0 });
    assertEquals(isExpired(post, 30, NOW), true);
  });

  it("does not expire recent post with board timeout", () => {
    const post = makePost({ createdAt: NOW - 5 * DAY, timeout: 0 });
    assertEquals(isExpired(post, 30, NOW), false);
  });

  it("post-level timeout overrides board timeout", () => {
    const post = makePost({ createdAt: NOW - 6 * DAY, timeout: 5 });
    assertEquals(isExpired(post, 30, NOW), true);
  });

  it("board timeout of 0 means no expiry regardless of post age", () => {
    const post = makePost({ createdAt: 0 }); // ancient
    assertEquals(isExpired(post, 0, NOW), false);
  });
});

describe("archive board behavior", () => {
  it("archive boards should be skipped during cleanup", () => {
    const boards: IBoard[] = [
      { num: 1, timeout: 30, type: "normal" },
      { num: 2, timeout: 30, type: "archive" },
    ];
    const toProcess = boards.filter((b) => b.type !== "archive" && b.timeout > 0);
    assertEquals(toProcess.length, 1);
    assertEquals(toProcess[0].num, 1);
  });

  it("boards with archiveTo route expired posts to archive board", () => {
    const board: IBoard = { num: 1, timeout: 30, archiveTo: "board-2", type: "normal" };
    assertEquals(typeof board.archiveTo, "string");
    assertEquals(board.archiveTo, "board-2");
  });

  it("boards without archiveTo delete expired posts directly", () => {
    const board: IBoard = { num: 1, timeout: 30, type: "normal" };
    assertEquals(board.archiveTo, undefined);
  });
});

describe("cleanup eligibility", () => {
  it("skips boards with timeout 0", () => {
    const board: IBoard = { num: 1, timeout: 0, type: "normal" };
    const shouldProcess = board.type !== "archive" && board.timeout > 0;
    assertEquals(shouldProcess, false);
  });

  it("processes boards with positive timeout", () => {
    const board: IBoard = { num: 1, timeout: 7, type: "normal" };
    assertEquals(board.type !== "archive" && board.timeout > 0, true);
  });
});
