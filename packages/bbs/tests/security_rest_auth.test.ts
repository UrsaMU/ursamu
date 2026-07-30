/**
 * REST auth helpers — staff flags + board/post visibility.
 * Pure unit tests (no KV).
 */
import { assertEquals } from "@std/assert";
import {
  bareId,
  canDeletePost,
  canEditPost,
  canModeratePost,
  canReadBoard,
  canWriteBoard,
  flagSetFromRaw,
  getReadSet,
  isBoardModId,
  isStaffFlagSet,
  parseModeratorsField,
} from "../src/rest-auth.ts";
import type { IBoard, IPost } from "../src/db.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function board(over: Partial<IBoard> = {}): IBoard {
  return {
    id: "board-1",
    num: 1,
    title: "OOC",
    timeout: 0,
    anonymous: false,
    readLock: "all()",
    writeLock: "all()",
    pendingDelete: false,
    category: "General",
    type: "normal",
    moderators: [],
    ...over,
  };
}

function post(over: Partial<IPost> = {}): IPost {
  return {
    id: "p1",
    boardId: 1,
    num: 1,
    subject: "Hi",
    body: "body",
    authorId: "10",
    authorName: "Alice",
    createdAt: 1,
    timeout: 0,
    editCount: 0,
    replies: [],
    sticky: false,
    tags: [],
    flags: [],
    watchers: [],
    ...over,
  };
}

Deno.test("bareId strips hash", OPTS, () => {
  assertEquals(bareId("#12"), "12");
  assertEquals(bareId("12"), "12");
});

Deno.test("flagSetFromRaw — string tokens", OPTS, () => {
  const s = flagSetFromRaw("player connected admin");
  assertEquals(s.has("admin"), true);
});

Deno.test("flagSetFromRaw — Set input", OPTS, () => {
  const s = flagSetFromRaw(new Set(["Wizard"]));
  assertEquals(isStaffFlagSet(s), true);
});

Deno.test(
  "flagSetFromRaw — no substring staff bypass",
  OPTS,
  () => {
    const s = flagSetFromRaw("notadmin player");
    assertEquals(s.has("admin"), false);
    assertEquals(isStaffFlagSet(s), false);
  },
);

Deno.test("isStaffFlagSet — builder is not staff", OPTS, () => {
  assertEquals(
    isStaffFlagSet(flagSetFromRaw("player builder")),
    false,
  );
});

Deno.test("isBoardModId — bare id match", OPTS, () => {
  const b = board({ moderators: ["5", "#7"] });
  assertEquals(isBoardModId("5", b), true);
  assertEquals(isBoardModId("#7", b), true);
  assertEquals(isBoardModId("9", b), false);
});

Deno.test("canReadBoard — open", OPTS, () => {
  assertEquals(
    canReadBoard(board(), { staff: false }),
    true,
  );
});

Deno.test("canReadBoard — staff bypass lock", OPTS, () => {
  const b = board({ readLock: "wizard+" });
  assertEquals(canReadBoard(b, { staff: true }), true);
  assertEquals(
    canReadBoard(b, {
      staff: false,
      flags: new Set(["player"]),
    }),
    false,
  );
});

Deno.test("canReadBoard — flag() lock", OPTS, () => {
  const b = board({ readLock: "flag(builder)" });
  assertEquals(
    canReadBoard(b, {
      staff: false,
      flags: new Set(["player", "builder"]),
    }),
    true,
  );
  assertEquals(
    canReadBoard(b, {
      staff: false,
      flags: new Set(["player"]),
    }),
    false,
  );
});

Deno.test("canReadBoard — perm() lock", OPTS, () => {
  const b = board({ readLock: "perm(admin)" });
  assertEquals(
    canReadBoard(b, {
      staff: false,
      flags: new Set(["player", "admin"]),
    }),
    true,
  );
  assertEquals(
    canReadBoard(b, {
      staff: false,
      flags: new Set(["player", "builder"]),
    }),
    false,
  );
});

Deno.test("canReadBoard — faction membership", OPTS, () => {
  const b = board({
    readLock: "faction",
    ownerId: "99",
  });
  assertEquals(
    canReadBoard(b, { staff: false, inFaction: false }),
    false,
  );
  assertEquals(
    canReadBoard(b, { staff: false, inFaction: true }),
    true,
  );
});

Deno.test("canWriteBoard — archive denied", OPTS, () => {
  const b = board({ type: "archive" });
  assertEquals(canWriteBoard(b, { staff: true }), false);
  assertEquals(canWriteBoard(b, { staff: false }), false);
});

Deno.test("canWriteBoard — open write", OPTS, () => {
  assertEquals(
    canWriteBoard(board(), { staff: false }),
    true,
  );
});

Deno.test("canWriteBoard — locked write staff only", OPTS, () => {
  const b = board({ writeLock: "admin+" });
  assertEquals(
    canWriteBoard(b, {
      staff: false,
      flags: new Set(["player"]),
    }),
    false,
  );
  assertEquals(canWriteBoard(b, { staff: true }), true);
  assertEquals(
    canWriteBoard(b, {
      staff: false,
      flags: new Set(["player", "admin"]),
    }),
    true,
  );
});

Deno.test("canEditPost — author", OPTS, () => {
  const p = post({ authorId: "10" });
  const b = board();
  assertEquals(canEditPost(p, b, "10", false), true);
  assertEquals(canEditPost(p, b, "11", false), false);
});

Deno.test("canEditPost — board mod", OPTS, () => {
  const p = post({ authorId: "10" });
  const b = board({ moderators: ["20"] });
  assertEquals(canEditPost(p, b, "20", false), true);
});

Deno.test("canModeratePost — sticky path", OPTS, () => {
  const b = board({ moderators: ["3"] });
  assertEquals(canModeratePost(b, "3", false), true);
  assertEquals(canModeratePost(b, "4", false), false);
  assertEquals(canModeratePost(b, "4", true), true);
});

Deno.test("canDeletePost — mirrors edit", OPTS, () => {
  const p = post({ authorId: "#8" });
  const b = board();
  assertEquals(canDeletePost(p, b, "8", false), true);
});

Deno.test("getReadSet — state preferred", OPTS, () => {
  const player = {
    state: { bb_read: { "1": ["2", "3"] } },
    data: { bb_read: { "1": ["9"] } },
  };
  const s = getReadSet(player, 1);
  assertEquals(s.has("2"), true);
  assertEquals(s.has("9"), false);
});

Deno.test("getReadSet — legacy data fallback", OPTS, () => {
  const player = {
    data: { bb_read: { "2": ["1"] } },
  };
  const s = getReadSet(player, 2);
  assertEquals(s.has("1"), true);
});

Deno.test("parseModeratorsField — array and string", OPTS, () => {
  assertEquals(
    parseModeratorsField(["#1", "2"]),
    ["1", "2"],
  );
  assertEquals(
    parseModeratorsField("3  #4"),
    ["3", "4"],
  );
  assertEquals(parseModeratorsField(undefined), undefined);
});
