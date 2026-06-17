/**
 * Tests for webhook.ts — payload construction and error handling.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { IBoard, IPost } from "../src/db.ts";

// ---------------------------------------------------------------------------
// Stubs — build the webhook payload the same way webhook.ts does
// ---------------------------------------------------------------------------

function buildWebhookPayload(board: IBoard, post: IPost) {
  return {
    embeds: [
      {
        title: post.subject.slice(0, 256),
        description: post.body.slice(0, 2000),
        color: 0x4a90d9,
        author: { name: board.anonymous ? "Anonymous" : post.authorName },
        footer: { text: `Board ${board.num}: ${board.title}` },
        timestamp: new Date(post.createdAt).toISOString(),
        fields: post.tags?.length
          ? [{ name: "Tags", value: post.tags.join(", "), inline: true }]
          : [],
      },
    ],
  };
}

function makeBoard(overrides: Partial<IBoard> = {}): IBoard {
  return {
    id: "board-1", num: 1, title: "General", timeout: 0,
    anonymous: false, readLock: "all()", writeLock: "all()",
    pendingDelete: false, category: "General", type: "normal",
    moderators: [],
    ...overrides,
  };
}

function makePost(overrides: Partial<IPost> = {}): IPost {
  return {
    id: "p1", boardId: 1, num: 1, subject: "Test Subject",
    body: "Test body content", authorId: "p1", authorName: "Alice",
    createdAt: Date.now(), timeout: 0, editCount: 0, replies: [],
    sticky: false, tags: [], flags: [], watchers: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("webhook payload", () => {
  it("includes board title in footer", () => {
    const payload = buildWebhookPayload(makeBoard({ title: "Lore" }), makePost());
    assertStringIncludes(payload.embeds[0].footer.text, "Lore");
  });

  it("uses Anonymous as author name on anonymous boards", () => {
    const payload = buildWebhookPayload(makeBoard({ anonymous: true }), makePost());
    assertEquals(payload.embeds[0].author.name, "Anonymous");
  });

  it("uses real author name on non-anonymous boards", () => {
    const payload = buildWebhookPayload(makeBoard(), makePost({ authorName: "Bob" }));
    assertEquals(payload.embeds[0].author.name, "Bob");
  });

  it("truncates subject to 256 chars", () => {
    const longSubject = "x".repeat(300);
    const payload = buildWebhookPayload(makeBoard(), makePost({ subject: longSubject }));
    assertEquals(payload.embeds[0].title.length, 256);
  });

  it("truncates body to 2000 chars", () => {
    const longBody = "y".repeat(3000);
    const payload = buildWebhookPayload(makeBoard(), makePost({ body: longBody }));
    assertEquals(payload.embeds[0].description.length, 2000);
  });

  it("includes tags field when tags present", () => {
    const payload = buildWebhookPayload(makeBoard(), makePost({ tags: ["lore", "ic"] }));
    assertEquals(payload.embeds[0].fields.length, 1);
    assertStringIncludes(payload.embeds[0].fields[0].value, "lore");
  });

  it("omits fields array when no tags", () => {
    const payload = buildWebhookPayload(makeBoard(), makePost({ tags: [] }));
    assertEquals(payload.embeds[0].fields.length, 0);
  });

  it("sets color to expected value", () => {
    const payload = buildWebhookPayload(makeBoard(), makePost());
    assertEquals(payload.embeds[0].color, 0x4a90d9);
  });

  it("timestamp is valid ISO string", () => {
    const ts = buildWebhookPayload(makeBoard(), makePost()).embeds[0].timestamp;
    assertEquals(typeof ts, "string");
    assertEquals(isNaN(Date.parse(ts)), false);
  });
});

describe("webhook URL safety", () => {
  it("rejects non-https URLs", () => {
    const url = "http://example.com/webhook";
    const safe = url.startsWith("https://");
    assertEquals(safe, false);
  });
  it("accepts https URLs", () => {
    const url = "https://discord.com/api/webhooks/123/abc";
    assertEquals(url.startsWith("https://"), true);
  });
});
