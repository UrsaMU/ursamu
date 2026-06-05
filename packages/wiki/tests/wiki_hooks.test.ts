/**
 * Tests for hooks.ts — wikiHooks on/off/emit lifecycle
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { wikiHooks } from "../src/hooks.ts";
import type { WikiPageRef } from "../src/hooks.ts";

const PAGE: WikiPageRef = { path: "news/test", meta: { title: "Test" } };

describe("wikiHooks — wiki:created", () => {
  it("fires registered handler", async () => {
    const calls: string[] = [];
    const handler = (p: WikiPageRef) => { calls.push(p.path); };
    wikiHooks.on("wiki:created", handler);
    await wikiHooks.emit("wiki:created", PAGE);
    wikiHooks.off("wiki:created", handler);
    assertEquals(calls.includes("news/test"), true);
  });

  it("off removes handler — no longer called", async () => {
    const calls: string[] = [];
    const handler = (p: WikiPageRef) => { calls.push(p.path); };
    wikiHooks.on("wiki:created", handler);
    wikiHooks.off("wiki:created", handler);
    await wikiHooks.emit("wiki:created", PAGE);
    assertEquals(calls.length, 0);
  });

  it("multiple handlers all fire", async () => {
    const results: number[] = [];
    const h1 = () => { results.push(1); };
    const h2 = () => { results.push(2); };
    wikiHooks.on("wiki:created", h1);
    wikiHooks.on("wiki:created", h2);
    await wikiHooks.emit("wiki:created", PAGE);
    wikiHooks.off("wiki:created", h1);
    wikiHooks.off("wiki:created", h2);
    assertEquals(results.includes(1), true);
    assertEquals(results.includes(2), true);
  });

  it("error in one handler does not stop others", async () => {
    const results: string[] = [];
    const bad  = () => { throw new Error("boom"); };
    const good = () => { results.push("ok"); };
    wikiHooks.on("wiki:created", bad);
    wikiHooks.on("wiki:created", good);
    await wikiHooks.emit("wiki:created", PAGE);
    wikiHooks.off("wiki:created", bad);
    wikiHooks.off("wiki:created", good);
    assertEquals(results.includes("ok"), true);
  });

  it("async handlers are awaited", async () => {
    const results: string[] = [];
    const handler = async () => {
      await new Promise((r) => setTimeout(r, 5));
      results.push("async");
    };
    wikiHooks.on("wiki:created", handler);
    await wikiHooks.emit("wiki:created", PAGE);
    wikiHooks.off("wiki:created", handler);
    assertEquals(results.includes("async"), true);
  });
});

describe("wikiHooks — wiki:edited", () => {
  it("fires with updated body", async () => {
    const received: WikiPageRef[] = [];
    const handler = (p: WikiPageRef) => { received.push(p); };
    wikiHooks.on("wiki:edited", handler);
    await wikiHooks.emit("wiki:edited", { ...PAGE, body: "new body" });
    wikiHooks.off("wiki:edited", handler);
    assertEquals(received[0]?.body, "new body");
  });
});

describe("wikiHooks — wiki:deleted", () => {
  it("fires with no body", async () => {
    const received: WikiPageRef[] = [];
    const handler = (p: WikiPageRef) => { received.push(p); };
    wikiHooks.on("wiki:deleted", handler);
    await wikiHooks.emit("wiki:deleted", PAGE);
    wikiHooks.off("wiki:deleted", handler);
    assertEquals(received[0]?.body, undefined);
  });
});

describe("wikiHooks — wiki:renamed", () => {
  it("fires with oldPath", async () => {
    const received: WikiPageRef[] = [];
    const handler = (p: WikiPageRef) => { received.push(p); };
    wikiHooks.on("wiki:renamed", handler);
    await wikiHooks.emit("wiki:renamed", { ...PAGE, oldPath: "news/old" });
    wikiHooks.off("wiki:renamed", handler);
    assertEquals(received[0]?.oldPath, "news/old");
  });
});

describe("wikiHooks — emit with no handlers", () => {
  it("does not throw", async () => {
    // All event types should be safe to emit with no handlers
    await wikiHooks.emit("wiki:created", PAGE);
    await wikiHooks.emit("wiki:edited", PAGE);
    await wikiHooks.emit("wiki:deleted", PAGE);
    await wikiHooks.emit("wiki:renamed", PAGE);
  });
});
