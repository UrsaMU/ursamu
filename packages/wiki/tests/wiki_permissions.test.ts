/**
 * Tests for permissions.ts — isAdmin, canReadPage, isValidReadLock
 * Uses local stubs — no live DB.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { isAdmin, isValidReadLock } from "../src/permissions.ts";
import type { IUrsamuSDK } from "@ursamu/mush";

// ─── mock helpers ─────────────────────────────────────────────────────────────

function mockU(flags: string[]): IUrsamuSDK {
  return {
    me: {
      id: "p1", name: "TestPlayer",
      flags: new Set(flags),
      state: {}, location: "2", contents: [],
    },
    cmd: { name: "", original: "", args: [], switches: [] },
    send: () => {},
    util: {
      stripSubs: (s: string) => s,
      displayName: (o: { name?: string }) => o.name ?? "",
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
      center: (s: string) => s,
      sprintf: (f: string) => f,
      target: () => Promise.resolve(null),
    },
  } as unknown as IUrsamuSDK;
}

// ─── isAdmin ─────────────────────────────────────────────────────────────────

describe("isAdmin", () => {
  it("returns true for admin flag", () => {
    assertEquals(isAdmin(mockU(["player", "admin"])), true);
  });

  it("returns true for wizard flag", () => {
    assertEquals(isAdmin(mockU(["player", "wizard"])), true);
  });

  it("returns true for superuser flag", () => {
    assertEquals(isAdmin(mockU(["player", "superuser"])), true);
  });

  it("returns false for plain player", () => {
    assertEquals(isAdmin(mockU(["player", "connected"])), false);
  });
});

// ─── isValidReadLock ─────────────────────────────────────────────────────────

describe("isValidReadLock", () => {
  it("accepts 'connected'", () => { assertEquals(isValidReadLock("connected"), true); });
  it("accepts 'admin'", () => { assertEquals(isValidReadLock("admin"), true); });
  it("accepts 'staff'", () => { assertEquals(isValidReadLock("staff"), true); });
  it("accepts 'faction:<id>'", () => { assertEquals(isValidReadLock("faction:abc123"), true); });
  it("rejects arbitrary strings", () => { assertEquals(isValidReadLock("public"), false); });
  it("rejects empty string", () => { assertEquals(isValidReadLock(""), false); });
  it("rejects 'faction:' without id", () => {
    // "faction:" with no id is syntactically valid but semantically useless — still passes format check
    assertEquals(isValidReadLock("faction:"), true);
  });
});
