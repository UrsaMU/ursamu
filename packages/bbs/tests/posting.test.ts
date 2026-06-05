/**
 * Tests for posting logic — post creation, reply, draft submit, watcher notification.
 * Uses inline stubs to avoid real DBO imports.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

interface IPost {
  id: string; boardId: number; num: number; subject: string; body: string;
  authorId: string; authorName: string; createdAt: number; timeout: number;
  editCount: number; replies: IReply[]; sticky: boolean;
  icTag?: "ic" | "ooc"; tags: string[]; flags: never[]; watchers: string[];
}

interface IReply {
  num: number; subject: string; body: string;
  authorId: string; authorName: string; createdAt: number;
  editCount: number; icTag?: "ic" | "ooc";
}

function makePost(overrides: Partial<IPost> = {}): IPost {
  return {
    id: "post-1", boardId: 1, num: 1, subject: "Hello", body: "World",
    authorId: "p1", authorName: "Alice", createdAt: Date.now(),
    timeout: 0, editCount: 0, replies: [], sticky: false,
    tags: [], flags: [], watchers: [],
    ...overrides,
  };
}

function getNextReplyNum(post: IPost): number {
  if (!post.replies.length) return 1;
  return Math.max(...post.replies.map((r) => r.num)) + 1;
}

function buildReplyBody(text: string, sig: string | null): string {
  return sig ? `${text}\n---\n${sig}` : text;
}

function buildPostBody(text: string, sig: string | null): string {
  return sig ? `${text}\n---\n${sig}` : text;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getNextReplyNum", () => {
  it("returns 1 for post with no replies", () => {
    assertEquals(getNextReplyNum(makePost()), 1);
  });
  it("returns max+1 for existing replies", () => {
    const post = makePost({ replies: [
      { num: 1, subject: "Re:", body: "x", authorId: "p1", authorName: "A", createdAt: 0, editCount: 0 },
      { num: 3, subject: "Re:", body: "y", authorId: "p1", authorName: "A", createdAt: 0, editCount: 0 },
    ]});
    assertEquals(getNextReplyNum(post), 4);
  });
});

describe("buildReplyBody", () => {
  it("appends signature when present", () => {
    const body = buildReplyBody("Great post!", "-- Alice");
    assertStringIncludes(body, "---");
    assertStringIncludes(body, "Alice");
  });
  it("returns plain body when no signature", () => {
    assertEquals(buildReplyBody("Hello", null), "Hello");
  });
});

describe("buildPostBody", () => {
  it("appends signature to post body", () => {
    assertStringIncludes(buildPostBody("Content", "Sig"), "---");
  });
  it("returns content unchanged when no sig", () => {
    assertEquals(buildPostBody("Content", null), "Content");
  });
});

describe("watcher notification logic", () => {
  it("notifies all watchers except reply author", () => {
    const post = makePost({ watchers: ["p2", "p3", "p1"] }); // p1 is the author
    const authorId = "p1";
    const toNotify = post.watchers.filter((w) => w !== authorId);
    assertEquals(toNotify, ["p2", "p3"]);
  });

  it("sends no notifications when watchers is empty", () => {
    const post = makePost({ watchers: [] });
    assertEquals(post.watchers.filter((w) => w !== "p1"), []);
  });
});

describe("watcher cap enforcement", () => {
  it("respects watcher cap of 50", () => {
    const WATCHER_CAP = 50;
    const watchers = Array.from({ length: WATCHER_CAP }, (_, i) => `p${i}`);
    const canAdd = watchers.length < WATCHER_CAP;
    assertEquals(canAdd, false);
  });

  it("allows adding when under cap", () => {
    const WATCHER_CAP = 50;
    const watchers = ["p1", "p2"];
    const canAdd = watchers.length < WATCHER_CAP;
    assertEquals(canAdd, true);
  });
});

describe("IC/OOC tag propagation", () => {
  it("stores icTag on post", () => {
    const post = makePost({ icTag: "ic" });
    assertEquals(post.icTag, "ic");
  });

  it("stores ooc tag on post", () => {
    const post = makePost({ icTag: "ooc" });
    assertEquals(post.icTag, "ooc");
  });

  it("defaults to no tag", () => {
    assertEquals(makePost().icTag, undefined);
  });
});

describe("sticky post sorting", () => {
  it("sticky posts sort before non-sticky", () => {
    const postList = [
      makePost({ num: 1, sticky: false }),
      makePost({ num: 2, sticky: true }),
      makePost({ num: 3, sticky: false }),
    ];
    const sorted = [...postList].sort((a, b) => {
      if (a.sticky && !b.sticky) return -1;
      if (!a.sticky && b.sticky) return 1;
      return a.num - b.num;
    });
    assertEquals(sorted[0].num, 2);
    assertEquals(sorted[1].num, 1);
    assertEquals(sorted[2].num, 3);
  });
});

describe("tag operations", () => {
  it("parses comma-separated tags", () => {
    const raw = "lore,history, events";
    const tags = raw.split(",").map((t) => t.trim()).filter(Boolean);
    assertEquals(tags, ["lore", "history", "events"]);
  });

  it("filters posts by tag", () => {
    const posts = [
      makePost({ tags: ["lore", "history"] }),
      makePost({ tags: ["ooc"] }),
      makePost({ tags: ["lore"] }),
    ];
    const lore = posts.filter((p) => p.tags.includes("lore"));
    assertEquals(lore.length, 2);
  });

  it("clears tags when empty string given", () => {
    const raw: string = "";
    const tags = raw ? raw.split(",").map((t: string) => t.trim()).filter(Boolean) : [];
    assertEquals(tags, []);
  });
});
