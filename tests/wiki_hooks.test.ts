/**
 * tests/wiki_hooks.test.ts
 *
 * Tests for the WikiHooks registry (src/plugins/wiki/hooks.ts).
 * Covers: on/emit for wiki:created, wiki:edited, wiki:deleted,
 * off removes handler, error isolation, and async handlers.
 */
import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { wikiHooks } from "../src/plugins/wiki/hooks.ts";
import type { WikiPageRef } from "../src/plugins/wiki/hooks.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ─── sample payload ───────────────────────────────────────────────────────────

const CREATED_PAGE: WikiPageRef = {
  path: "news/test-article",
  meta: { title: "Test Article", author: "Alice", date: "2026-03-18" },
  body: "This is the test article body.",
};

const EDITED_PAGE: WikiPageRef = {
  path: "news/test-article",
  meta: { title: "Test Article (Edited)", author: "Alice", date: "2026-03-18" },
  body: "Updated body content.",
};

const DELETED_PAGE: WikiPageRef = {
  path: "news/test-article",
  meta: { title: "Test Article", author: "Alice" },
};

// ─── wiki:created ─────────────────────────────────────────────────────────────

Deno.test("WikiHooks — wiki:created: on + emit delivers payload", OPTS, async () => {
  const received: WikiPageRef[] = [];
  const handler = (p: WikiPageRef) => { received.push(p); };
  wikiHooks.on("wiki:created", handler);

  await wikiHooks.emit("wiki:created", CREATED_PAGE);

  wikiHooks.off("wiki:created", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].path, "news/test-article");
  assertEquals(received[0].meta.title, "Test Article");
  assertEquals(received[0].body, "This is the test article body.");
});

Deno.test("WikiHooks — wiki:created: off removes handler", OPTS, async () => {
  const received: WikiPageRef[] = [];
  const handler = (p: WikiPageRef) => { received.push(p); };
  wikiHooks.on("wiki:created", handler);
  wikiHooks.off("wiki:created", handler);

  await wikiHooks.emit("wiki:created", CREATED_PAGE);

  assertEquals(received.length, 0);
});

Deno.test("WikiHooks — wiki:created: multiple handlers both fire", OPTS, async () => {
  const calls: string[] = [];
  const h1 = () => { calls.push("h1"); };
  const h2 = () => { calls.push("h2"); };
  wikiHooks.on("wiki:created", h1);
  wikiHooks.on("wiki:created", h2);

  await wikiHooks.emit("wiki:created", CREATED_PAGE);

  wikiHooks.off("wiki:created", h1);
  wikiHooks.off("wiki:created", h2);
  assertEquals(calls, ["h1", "h2"]);
});

Deno.test("WikiHooks — wiki:created: error isolation", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("created bad"); };
  const good = () => { calls.push("created-good"); };
  wikiHooks.on("wiki:created", bad);
  wikiHooks.on("wiki:created", good);

  await wikiHooks.emit("wiki:created", CREATED_PAGE);

  wikiHooks.off("wiki:created", bad);
  wikiHooks.off("wiki:created", good);
  assertEquals(calls, ["created-good"]);
});

Deno.test("WikiHooks — wiki:created: async handler is awaited", OPTS, async () => {
  const calls: string[] = [];
  const handler = async (p: WikiPageRef) => {
    await Promise.resolve();
    calls.push(p.path);
  };
  wikiHooks.on("wiki:created", handler);

  await wikiHooks.emit("wiki:created", CREATED_PAGE);

  wikiHooks.off("wiki:created", handler);
  assertEquals(calls, ["news/test-article"]);
});

Deno.test("WikiHooks — wiki:created: emit with no handlers is safe", OPTS, async () => {
  await wikiHooks.emit("wiki:created", CREATED_PAGE);
});

// ─── wiki:edited ──────────────────────────────────────────────────────────────

Deno.test("WikiHooks — wiki:edited: on + emit delivers payload", OPTS, async () => {
  const received: WikiPageRef[] = [];
  const handler = (p: WikiPageRef) => { received.push(p); };
  wikiHooks.on("wiki:edited", handler);

  await wikiHooks.emit("wiki:edited", EDITED_PAGE);

  wikiHooks.off("wiki:edited", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].meta.title, "Test Article (Edited)");
  assertEquals(received[0].body, "Updated body content.");
});

Deno.test("WikiHooks — wiki:edited: off removes handler", OPTS, async () => {
  const received: WikiPageRef[] = [];
  const handler = (p: WikiPageRef) => { received.push(p); };
  wikiHooks.on("wiki:edited", handler);
  wikiHooks.off("wiki:edited", handler);

  await wikiHooks.emit("wiki:edited", EDITED_PAGE);

  assertEquals(received.length, 0);
});

Deno.test("WikiHooks — wiki:edited: error isolation", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("edited bad"); };
  const good = () => { calls.push("edited-good"); };
  wikiHooks.on("wiki:edited", bad);
  wikiHooks.on("wiki:edited", good);

  await wikiHooks.emit("wiki:edited", EDITED_PAGE);

  wikiHooks.off("wiki:edited", bad);
  wikiHooks.off("wiki:edited", good);
  assertEquals(calls, ["edited-good"]);
});

Deno.test("WikiHooks — wiki:edited: async handler is awaited", OPTS, async () => {
  const calls: string[] = [];
  const handler = async (p: WikiPageRef) => {
    await Promise.resolve();
    calls.push(p.body ?? "no-body");
  };
  wikiHooks.on("wiki:edited", handler);

  await wikiHooks.emit("wiki:edited", EDITED_PAGE);

  wikiHooks.off("wiki:edited", handler);
  assertEquals(calls, ["Updated body content."]);
});

Deno.test("WikiHooks — wiki:edited: emit with no handlers is safe", OPTS, async () => {
  await wikiHooks.emit("wiki:edited", EDITED_PAGE);
});

// ─── wiki:deleted ─────────────────────────────────────────────────────────────

Deno.test("WikiHooks — wiki:deleted: on + emit delivers payload", OPTS, async () => {
  const received: WikiPageRef[] = [];
  const handler = (p: WikiPageRef) => { received.push(p); };
  wikiHooks.on("wiki:deleted", handler);

  await wikiHooks.emit("wiki:deleted", DELETED_PAGE);

  wikiHooks.off("wiki:deleted", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].path, "news/test-article");
  assertEquals(received[0].body, undefined);
});

Deno.test("WikiHooks — wiki:deleted: off removes handler", OPTS, async () => {
  const received: WikiPageRef[] = [];
  const handler = (p: WikiPageRef) => { received.push(p); };
  wikiHooks.on("wiki:deleted", handler);
  wikiHooks.off("wiki:deleted", handler);

  await wikiHooks.emit("wiki:deleted", DELETED_PAGE);

  assertEquals(received.length, 0);
});

Deno.test("WikiHooks — wiki:deleted: error isolation", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("deleted bad"); };
  const good = () => { calls.push("deleted-good"); };
  wikiHooks.on("wiki:deleted", bad);
  wikiHooks.on("wiki:deleted", good);

  await wikiHooks.emit("wiki:deleted", DELETED_PAGE);

  wikiHooks.off("wiki:deleted", bad);
  wikiHooks.off("wiki:deleted", good);
  assertEquals(calls, ["deleted-good"]);
});

Deno.test("WikiHooks — wiki:deleted: async handler is awaited", OPTS, async () => {
  const calls: string[] = [];
  const handler = async (p: WikiPageRef) => {
    await Promise.resolve();
    calls.push(p.path);
  };
  wikiHooks.on("wiki:deleted", handler);

  await wikiHooks.emit("wiki:deleted", DELETED_PAGE);

  wikiHooks.off("wiki:deleted", handler);
  assertEquals(calls, ["news/test-article"]);
});

Deno.test("WikiHooks — wiki:deleted: emit with no handlers is safe", OPTS, async () => {
  await wikiHooks.emit("wiki:deleted", DELETED_PAGE);
});
