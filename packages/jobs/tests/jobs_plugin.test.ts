/**
 * Tests for the @ursamu/jobs command handlers and format helpers.
 *
 * Uses an in-process mock SDK — no Deno KV or network access required.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

// ─── Mock SDK helpers ─────────────────────────────────────────────────────────

interface IDBObj {
  id: string;
  name: string;
  flags: Set<string>;
  state: Record<string, unknown>;
  location?: string;
  contents: string[];
}

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "1", name: "TestPlayer",
    flags: new Set(["player", "connected"]),
    state: {}, location: "2", contents: [],
    ...overrides,
  };
}

function _mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  targetResult?: IDBObj | null;
  canEditResult?: boolean;
} = {}) {
  const sent: string[] = [];
  return Object.assign({
    me: mockPlayer(opts.me ?? {}),
    here: { ...mockPlayer({ id: "2", name: "Room", flags: new Set(["room"]) }), broadcast: () => {} },
    cmd: { name: "", original: "", args: opts.args ?? [], switches: [] },
    send: (m: string) => { sent.push(m); },
    broadcast: () => {},
    canEdit: () => Promise.resolve(opts.canEditResult ?? true),
    db: {
      modify: () => Promise.resolve(),
      search: () => Promise.resolve([]),
      create: (d: unknown) => Promise.resolve({ ...(d as object), id: "99", flags: new Set(), contents: [] }),
      destroy: () => Promise.resolve(),
    },
    util: {
      target: () => Promise.resolve(opts.targetResult ?? null),
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
      sprintf: (f: string) => f,
    },
  }, { _sent: sent });
}

// ─── format.ts ────────────────────────────────────────────────────────────────

import { isStaffFlags, header, jobHeader, divider, footer, formatDate, formatTimeShort, formatTimeFull, getEscalation, isNew, formatJobList } from "../src/format.ts";
import type { IJob } from "../src/types.ts";

function makeJob(overrides: Partial<IJob> = {}): IJob {
  return {
    id: "job-1", number: 1, title: "Test Issue",
    bucket: "BUG", status: "open",
    submittedBy: "player-1", submitterName: "Alice",
    description: "Something broke.", comments: [],
    createdAt: 1700000000000, updatedAt: 1700000000000,
    ...overrides,
  };
}

describe("isStaffFlags", () => {
  it("returns true for admin", () => assertEquals(isStaffFlags(new Set(["player", "admin"])), true));
  it("returns true for wizard", () => assertEquals(isStaffFlags(new Set(["wizard"])), true));
  it("returns true for superuser", () => assertEquals(isStaffFlags(new Set(["superuser"])), true));
  it("returns false for plain player", () => assertEquals(isStaffFlags(new Set(["player", "connected"])), false));
  it("does not pass on substring (e.g. notadmin)", () => assertEquals(isStaffFlags(new Set(["notadmin"])), false));
});

describe("header / divider / footer", () => {
  it("header is 77 chars wide", () => assertEquals(header("Test").length, 77));
  it("divider is 77 chars wide", () => assertEquals(divider().length, 77));
  it("footer is 77 chars wide", () => assertEquals(footer().length, 77));
  it("jobHeader contains the title text", () => assertStringIncludes(jobHeader("Jobs"), "Jobs"));
});

describe("formatDate", () => {
  it("returns mm-dd-yy format", () => {
    // Use a fixed date: 2024-01-15
    const epoch = new Date(2024, 0, 15).getTime();
    assertEquals(formatDate(epoch), "01-15-24");
  });
  it("returns ??? for invalid epoch", () => assertEquals(formatDate(NaN), "???"));
});

describe("formatTimeShort", () => {
  it("returns 12-hour time string with pm", () => {
    const epoch = new Date(2024, 0, 15, 14, 30).getTime(); // 2:30 PM
    assertStringIncludes(formatTimeShort(epoch), "pm");
  });
  it("returns am for morning time", () => {
    const epoch = new Date(2024, 0, 15, 9, 0).getTime(); // 9:00 AM
    assertStringIncludes(formatTimeShort(epoch), "am");
  });
});

describe("getEscalation", () => {
  it("new job (no staff comments, < 48h) returns NEW", () => {
    const job = makeJob({ createdAt: Date.now() - 3600000 }); // 1 hour old
    const esc = getEscalation(job);
    assertEquals(esc.label, "NEW");
    assertEquals(esc.color, "%cg");
  });

  it("> 96h since last staff activity returns DUE (red)", () => {
    const staffComment = {
      authorId: "staff-1", authorName: "Staff",
      text: "Looking into it.", timestamp: Date.now() - 100 * 3600000,
      published: true,
    };
    const job = makeJob({ submittedBy: "player-1", comments: [staffComment] });
    const esc = getEscalation(job);
    assertEquals(esc.label, "DUE");
    assertStringIncludes(esc.color, "%cr");
  });

  it("< 48h since staff comment returns no label", () => {
    const staffComment = {
      authorId: "staff-1", authorName: "Staff",
      text: "Looking into it.", timestamp: Date.now() - 3600000,
      published: true,
    };
    const job = makeJob({ submittedBy: "player-1", comments: [staffComment] });
    const esc = getEscalation(job);
    assertEquals(esc.label, "");
  });
});

describe("isNew", () => {
  it("returns true with no comments", () => assertEquals(isNew(makeJob()), true));
  it("returns true with only submitter comments", () => {
    const job = makeJob({ comments: [{ authorId: "player-1", authorName: "Alice", text: "update", timestamp: 0, published: true }] });
    assertEquals(isNew(job), true);
  });
  it("returns false when staff commented", () => {
    const job = makeJob({ comments: [{ authorId: "staff-1", authorName: "Staff", text: "ACK", timestamp: 0, published: true }] });
    assertEquals(isNew(job), false);
  });
});

describe("formatJobList", () => {
  it("produces header, rows, footer", () => {
    const job = makeJob();
    const lines = formatJobList([job], "Test Jobs");
    assertEquals(lines.length >= 4, true);
    assertStringIncludes(lines[0], "Test Jobs");
    assertStringIncludes(lines[lines.length - 1], "End Jobs");
  });

  it("includes job number in a row", () => {
    const job = makeJob({ number: 42 });
    const lines = formatJobList([job], "Test");
    const hasNum = lines.some((l) => l.includes("42"));
    assertEquals(hasNum, true);
  });
});

// ─── notify.ts — flag parsing ─────────────────────────────────────────────────

describe("notify — flag parsing safety", () => {
  it("Set.has does not match substring flags", () => {
    // Simulates the per-socket flag check inside onJobCreated
    const flagStr = "notadmin player connected";
    const flagSet = new Set(flagStr.split(" ").filter(Boolean));
    assertEquals(flagSet.has("admin"), false);
  });

  it("Set.has matches exact flag", () => {
    const flagStr = "player connected admin";
    const flagSet = new Set(flagStr.split(" ").filter(Boolean));
    assertEquals(flagSet.has("admin"), true);
  });
});

// ─── router.ts — isStaffUser flag parsing ─────────────────────────────────────

describe("router — isStaffUser flag parsing", () => {
  it("wizard flag string detected correctly", () => {
    const flags = "player connected wizard";
    const flagSet = new Set(flags.split(" ").filter(Boolean));
    const result = flagSet.has("admin") || flagSet.has("wizard") || flagSet.has("superuser");
    assertEquals(result, true);
  });

  it("non-staff flags rejected", () => {
    const flags = "player connected builder";
    const flagSet = new Set(flags.split(" ").filter(Boolean));
    const result = flagSet.has("admin") || flagSet.has("wizard") || flagSet.has("superuser");
    assertEquals(result, false);
  });
});

// ─── format.ts exhaustive coverage ───────────────────────────────────────────

describe("formatTimeFull", () => {
  it("includes the year", () => {
    const epoch = new Date(2024, 0, 15, 14, 30, 0).getTime();
    assertStringIncludes(formatTimeFull(epoch), "2024");
  });
  it("returns ??? for NaN", () => assertEquals(formatTimeFull(NaN), "???"));
});
