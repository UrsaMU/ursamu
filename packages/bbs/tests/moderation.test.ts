/**
 * Tests for moderation features — sticky, flags, +bbunflag, +bbreview.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

interface IFlag {
  playerId: string; playerName: string; reason: string; createdAt: number;
}

interface IPost {
  id: string; authorId: string; sticky: boolean;
  flags: IFlag[]; watchers: string[];
}

function makePost(overrides: Partial<IPost> = {}): IPost {
  return { id: "p1", authorId: "player1", sticky: false, flags: [], watchers: [], ...overrides };
}

function toggleSticky(post: IPost): IPost {
  return { ...post, sticky: !post.sticky };
}

function addFlag(post: IPost, flag: IFlag): { ok: true; post: IPost } | { ok: false; post: IPost; error: string } {
  if (post.flags.some((f) => f.playerId === flag.playerId)) {
    return { ok: false, post, error: "Already flagged" };
  }
  return { ok: true, post: { ...post, flags: [...post.flags, flag] } };
}

function clearFlags(post: IPost): IPost {
  return { ...post, flags: [] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("+bbsticky", () => {
  it("toggles sticky from false to true", () => {
    const post = makePost({ sticky: false });
    assertEquals(toggleSticky(post).sticky, true);
  });
  it("toggles sticky from true to false", () => {
    assertEquals(toggleSticky(makePost({ sticky: true })).sticky, false);
  });
});

describe("+bbflag", () => {
  it("adds a flag to an unflagged post", () => {
    const post = makePost();
    const flag: IFlag = { playerId: "p2", playerName: "Bob", reason: "spam", createdAt: 0 };
    const result = addFlag(post, flag);
    assertEquals(result.ok, true);
    assertEquals(result.post.flags.length, 1);
    assertEquals(result.post.flags[0].playerId, "p2");
  });

  it("prevents double-flagging by same player", () => {
    const flag: IFlag = { playerId: "p2", playerName: "Bob", reason: "spam", createdAt: 0 };
    const post = makePost({ flags: [flag] });
    const result = addFlag(post, { ...flag, reason: "again" });
    assertEquals(result.ok, false);
    assertStringIncludes(!result.ok ? result.error : "", "Already flagged");
  });

  it("allows multiple players to flag the same post", () => {
    const post = makePost({ flags: [{ playerId: "p2", playerName: "Bob", reason: "x", createdAt: 0 }] });
    const result = addFlag(post, { playerId: "p3", playerName: "Carol", reason: "y", createdAt: 0 });
    assertEquals(result.ok, true);
    assertEquals(result.post.flags.length, 2);
  });

  it("stores the reason on the flag", () => {
    const post = makePost();
    const result = addFlag(post, { playerId: "p1", playerName: "A", reason: "bad content", createdAt: 0 });
    assertEquals(result.post.flags[0].reason, "bad content");
  });
});

describe("+bbunflag", () => {
  it("clears all flags from a post", () => {
    const post = makePost({ flags: [
      { playerId: "p1", playerName: "A", reason: "x", createdAt: 0 },
      { playerId: "p2", playerName: "B", reason: "y", createdAt: 0 },
    ]});
    assertEquals(clearFlags(post).flags.length, 0);
  });
  it("is a no-op on an already-clean post", () => {
    assertEquals(clearFlags(makePost()).flags.length, 0);
  });
});

describe("+bbreview — filter logic", () => {
  it("returns only posts with flags", () => {
    const posts: IPost[] = [
      makePost({ id: "a", flags: [] }),
      makePost({ id: "b", flags: [{ playerId: "p1", playerName: "A", reason: "", createdAt: 0 }] }),
      makePost({ id: "c", flags: [] }),
    ];
    const flagged = posts.filter((p) => p.flags.length > 0);
    assertEquals(flagged.length, 1);
    assertEquals(flagged[0].id, "b");
  });
});

describe("moderator privilege check", () => {
  it("staff passes board mod check regardless of moderators list", () => {
    const isStaff  = (flags: Set<string>) => flags.has("admin") || flags.has("wizard");
    const isBoardMod = (id: string, mods: string[], flags: Set<string>) => isStaff(flags) || mods.includes(id);

    assertEquals(isBoardMod("nobody", [], new Set(["admin"])), true);
    assertEquals(isBoardMod("p1", ["p1"], new Set(["player"])), true);
    assertEquals(isBoardMod("p2", ["p1"], new Set(["player"])), false);
  });
});
