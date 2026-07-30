/**
 * True-name helpers — replies must never use moniker.
 */
import { assertEquals } from "@std/assert";
import { trueNameFromMe } from "../src/author.ts";
import { formatPost } from "../src/display.ts";
import type { IBoard, IPost, IReply } from "../src/db.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("trueNameFromMe prefers state.name over moniker name", OPTS, () => {
  assertEquals(
    trueNameFromMe({
      name: "%chDia%cn",
      state: { name: "Diablerie" },
    }),
    "Diablerie",
  );
});

Deno.test("trueNameFromMe falls back to name", OPTS, () => {
  assertEquals(
    trueNameFromMe({ name: "Alice", state: {} }),
    "Alice",
  );
});

Deno.test("formatPost reply uses authorLabel override", OPTS, () => {
  const board = {
    id: "b1",
    num: 1,
    title: "Test",
    timeout: 0,
    anonymous: false,
    readLock: "all()",
    writeLock: "all()",
    pendingDelete: false,
    category: "General",
    type: "normal",
    moderators: [],
  } as IBoard;
  const post = {
    id: "p1",
    boardId: 1,
    num: 1,
    subject: "Hello",
    body: "body",
    authorId: "1",
    authorName: "Alice",
    createdAt: Date.now(),
    timeout: 0,
    editCount: 0,
    replies: [],
    sticky: false,
    tags: [],
    flags: [],
    watchers: [],
  } as IPost;
  const reply = {
    num: 1,
    subject: "Re: Hello",
    body: "yo",
    authorId: "2",
    authorName: "%chMono%cn",
    createdAt: Date.now(),
    editCount: 0,
  } as IReply;
  const out = formatPost(board, post, reply, "1.1", "TrueName");
  assertEquals(out.includes("Author: TrueName"), true);
  assertEquals(out.includes("%chMono%cn"), false);
});
