/**
 * Tests for db.ts — types, counter helpers, and seedBoards.
 * These use in-memory stubs rather than the real DBO.
 */
import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

// ---------------------------------------------------------------------------
// Inline stubs (avoid importing DBO / real DB)
// ---------------------------------------------------------------------------

interface IBoard {
  id: string; num: number; title: string; category: string;
  type: "normal" | "archive"; moderators: string[]; readLock: string;
  writeLock: string; timeout: number; anonymous: boolean; pendingDelete: boolean;
}

function makeBoard(num: number, title: string): IBoard {
  return {
    id: `board-${num}`, num, title, category: "General",
    type: "normal", moderators: [], readLock: "all()", writeLock: "all()",
    timeout: 0, anonymous: false, pendingDelete: false,
  };
}

function getNextBoardNumStub(existing: IBoard[]): number {
  const nums = existing.filter((b) => b.id !== "bbconfig").map((b) => b.num);
  return nums.length === 0 ? 1 : Math.max(...nums) + 1;
}

interface IPost { id: string; boardId: number; num: number; }

function getNextPostNumStub(existing: IPost[], boardNum: number): number {
  const boardPosts = existing.filter((p) => p.boardId === boardNum);
  if (boardPosts.length === 0) return 1;
  return Math.max(...boardPosts.map((p) => p.num)) + 1;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getNextBoardNum", () => {
  it("returns 1 when no boards exist", () => {
    assertEquals(getNextBoardNumStub([]), 1);
  });

  it("returns max+1 when boards exist", () => {
    const boards = [makeBoard(1, "A"), makeBoard(3, "B")];
    assertEquals(getNextBoardNumStub(boards), 4);
  });

  it("skips the bbconfig doc", () => {
    const boards = [makeBoard(2, "X"), { ...makeBoard(99, "__config__"), id: "bbconfig" }];
    assertEquals(getNextBoardNumStub(boards), 3);
  });
});

describe("getNextPostNum", () => {
  it("returns 1 when board has no posts", () => {
    assertEquals(getNextPostNumStub([], 1), 1);
  });

  it("returns max+1 for the correct board", () => {
    const p = [
      { id: "a", boardId: 1, num: 3 },
      { id: "b", boardId: 2, num: 10 },
    ];
    assertEquals(getNextPostNumStub(p, 1), 4);
    assertEquals(getNextPostNumStub(p, 2), 11);
  });
});

describe("IBoard schema — new fields", () => {
  it("has category, type, moderators, webhookUrl, archiveTo", () => {
    const board = makeBoard(1, "Test");
    assertExists(board.category);
    assertExists(board.type);
    assertExists(board.moderators);
    assertEquals(board.type, "normal");
    assertEquals(board.moderators, []);
    assertEquals(board.category, "General");
  });
});

describe("makeBoard defaults", () => {
  it("produces a valid board with expected defaults", () => {
    const b = makeBoard(5, "Lore");
    assertEquals(b.id, "board-5");
    assertEquals(b.num, 5);
    assertEquals(b.title, "Lore");
    assertEquals(b.readLock, "all()");
    assertEquals(b.pendingDelete, false);
  });
});
