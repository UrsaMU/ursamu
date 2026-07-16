/**
 * Tests for display.ts — bbDate, formatTimeFull, formatPost,
 * header/divider/footer (engine chrome / game.layout).
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  clearLayoutTemplates,
  setLayoutTemplates,
} from "@ursamu/mush";
import {
  bbDate,
  formatTimeFull,
  formatPost,
  header,
  divider,
  footer,
  WIDTH,
  EQ_LINE,
  DASH_LINE,
} from "../src/display.ts";
import type { IBoard, IPost } from "../src/db.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
    id: "post-1", boardId: 1, num: 3,
    subject: "Hello World",
    body: "This is the body.",
    authorId: "p1", authorName: "Alice",
    createdAt: new Date("2026-01-15T12:00:00Z").getTime(),
    timeout: 0, editCount: 0, replies: [],
    sticky: false, tags: [], flags: [], watchers: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bbDate", () => {
  it("formats epoch as MM-DD-YY", () => {
    const epoch = new Date("2026-03-22T12:00:00Z").getTime();
    const result = bbDate(epoch);
    assertStringIncludes(result, "-");
    assertStringIncludes(result, "26");
  });

  it("returns empty string for bad epoch", () => {
    assertEquals(bbDate(NaN), "");
  });
});

describe("formatTimeFull", () => {
  it("includes year", () => {
    const epoch = new Date("2026-06-15T12:00:00Z").getTime();
    const result = formatTimeFull(epoch);
    assertStringIncludes(result, "2026");
  });

  it("returns ??? for bad epoch", () => {
    assertEquals(formatTimeFull(NaN), "???");
  });
});

describe("header / divider / footer (engine chrome)", () => {
  it("header with title uses engine default block", () => {
    clearLayoutTemplates();
    const h = header("Test");
    assertStringIncludes(h, "Test");
    assertStringIncludes(h, "%ch");
    assertStringIncludes(h, "=");
  });

  it("header with no title is a solid = rule", () => {
    clearLayoutTemplates();
    const h = header();
    assertEquals(h, "=".repeat(WIDTH));
  });

  it("divider with title includes label", () => {
    clearLayoutTemplates();
    const d = divider("General");
    assertStringIncludes(d, "General");
    assertStringIncludes(d, "-");
  });

  it("divider with no title is a solid - rule", () => {
    clearLayoutTemplates();
    assertEquals(divider(), "-".repeat(WIDTH));
  });

  it("footer with no title matches header plain rule", () => {
    clearLayoutTemplates();
    assertEquals(footer(), header());
  });

  it("footer with title matches header style", () => {
    clearLayoutTemplates();
    assertEquals(footer("Done"), header("Done"));
  });

  it("accepts width as second arg (number overload)", () => {
    clearLayoutTemplates();
    const h = header("X", 40);
    assertStringIncludes(h, "X");
    assertStringIncludes(h, "=".repeat(40));
  });

  it("honors game.layout mushcode templates", () => {
    setLayoutTemplates({
      header: "[center(%ch%cy%0%cn,%1,%cg=%cn)]",
    });
    try {
      const h = header("Sheet", "=", 24);
      assertStringIncludes(h, "%cy");
      assertStringIncludes(h, "Sheet");
      const vis = h
        .replace(/%c[a-zA-Z]/g, "")
        .replace(/%[nrtbR]/g, "");
      assertEquals(vis.length, 24);
    } finally {
      clearLayoutTemplates();
    }
  });
});

describe("constants", () => {
  it("EQ_LINE is WIDTH = chars", () => {
    assertEquals(EQ_LINE.length, WIDTH);
    assertEquals(EQ_LINE[0], "=");
  });
  it("DASH_LINE is WIDTH - chars", () => {
    assertEquals(DASH_LINE.length, WIDTH);
    assertEquals(DASH_LINE[0], "-");
  });
  it("WIDTH matches engine default (78)", () => {
    assertEquals(WIDTH, 78);
  });
});

describe("formatPost", () => {
  it("includes board title via header()", () => {
    clearLayoutTemplates();
    const result = formatPost(makeBoard(), makePost());
    assertStringIncludes(result, "General");
  });

  it("uses footer rule at end", () => {
    clearLayoutTemplates();
    const result = formatPost(makeBoard(), makePost());
    assertStringIncludes(result, footer());
  });

  it("includes author name on non-anonymous board", () => {
    assertStringIncludes(
      formatPost(makeBoard(), makePost()),
      "Alice",
    );
  });

  it("hides author on anonymous board", () => {
    const result = formatPost(
      makeBoard({ anonymous: true }),
      makePost(),
    );
    assertStringIncludes(result, "Anonymous");
    assertEquals(result.includes("Alice"), false);
  });

  it("includes [IC] prefix when icTag is ic", () => {
    assertStringIncludes(
      formatPost(makeBoard(), makePost({ icTag: "ic" })),
      "[IC]",
    );
  });

  it("includes [OOC] prefix when icTag is ooc", () => {
    assertStringIncludes(
      formatPost(makeBoard(), makePost({ icTag: "ooc" })),
      "[OOC]",
    );
  });

  it("includes [STICKY] prefix for sticky posts", () => {
    assertStringIncludes(
      formatPost(makeBoard(), makePost({ sticky: true })),
      "[STICKY]",
    );
  });

  it("includes tags when present", () => {
    const result = formatPost(
      makeBoard(),
      makePost({ tags: ["lore", "history"] }),
    );
    assertStringIncludes(result, "lore");
    assertStringIncludes(result, "history");
  });

  it("includes scene link when sceneId present", () => {
    assertStringIncludes(
      formatPost(makeBoard(), makePost({ sceneId: "abc123" })),
      "abc123",
    );
  });

  it("includes (edited xN) when editCount > 0", () => {
    assertStringIncludes(
      formatPost(makeBoard(), makePost({ editCount: 2 })),
      "(edited x2)",
    );
  });

  it("includes post body", () => {
    assertStringIncludes(
      formatPost(makeBoard(), makePost()),
      "This is the body.",
    );
  });
});
