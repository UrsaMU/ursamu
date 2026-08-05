/**
 * Pure helpers for the admin WS hub (no live sockets).
 */
import { assertEquals } from "@std/assert";
import {
  isStaffFlags,
  wikiPageStub,
} from "../src/admin-ws-hub.ts";

Deno.test("isStaffFlags — staff roles", () => {
  assertEquals(isStaffFlags(new Set(["admin"])), true);
  assertEquals(isStaffFlags(new Set(["wizard"])), true);
  assertEquals(isStaffFlags(new Set(["superuser"])), true);
  assertEquals(isStaffFlags(new Set(["player"])), false);
  assertEquals(isStaffFlags(new Set(["staff"])), false);
});

Deno.test("wikiPageStub — maps meta + body length", () => {
  const stub = wikiPageStub(
    "news/hello",
    {
      title: "Hello",
      draft: true,
      author: "Ada",
      date: "2026-07-01",
      readLock: "admin+",
      tags: ["news", "pin"],
    },
    "body text here",
  );
  assertEquals(stub.path, "news/hello");
  assertEquals(stub.title, "Hello");
  assertEquals(stub.draft, true);
  assertEquals(stub.author, "Ada");
  assertEquals(stub.date, "2026-07-01");
  assertEquals(stub.readLock, "admin+");
  assertEquals(stub.tags, ["news", "pin"]);
  assertEquals(stub.chars, "body text here".length);
  assertEquals(stub.type, "page");
});

Deno.test("wikiPageStub — defaults", () => {
  const stub = wikiPageStub("bare", {});
  assertEquals(stub.title, "bare");
  assertEquals(stub.draft, false);
  assertEquals(stub.readLock, "connected");
  assertEquals(stub.tags, []);
  assertEquals(stub.chars, 0);
});
