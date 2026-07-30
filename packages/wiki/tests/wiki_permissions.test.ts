/**
 * Tests for permissions.ts — isAdmin, canReadPage, isValidReadLock
 * Uses local stubs — no live DB.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  isAdmin,
  isValidReadLock,
  canReadPageRest,
} from "../src/permissions.ts";
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
  it("accepts 'public'", () => {
    assertEquals(isValidReadLock("public"), true);
  });
  it("accepts 'connected'", () => {
    assertEquals(isValidReadLock("connected"), true);
  });
  it("accepts 'admin'", () => {
    assertEquals(isValidReadLock("admin"), true);
  });
  it("accepts 'staff'", () => {
    assertEquals(isValidReadLock("staff"), true);
  });
  it("accepts 'faction:<id>'", () => {
    assertEquals(isValidReadLock("faction:abc123"), true);
  });
  it("rejects arbitrary strings", () => {
    assertEquals(isValidReadLock("everyone"), false);
  });
  it("rejects empty string", () => {
    assertEquals(isValidReadLock(""), false);
  });
  it("rejects 'faction:' without id", () => {
    assertEquals(isValidReadLock("faction:"), false);
  });
});

// ─── canReadPageRest (no DB for public/connected) ─────────────────

describe("canReadPageRest", () => {
  it("public allows anonymous", async () => {
    assertEquals(
      await canReadPageRest(null, { readLock: "public" }),
      true,
    );
  });

  it("connected denies anonymous", async () => {
    assertEquals(
      await canReadPageRest(null, { readLock: "connected" }),
      false,
    );
  });

  it("connected allows any userId", async () => {
    assertEquals(
      await canReadPageRest("42", { readLock: "connected" }),
      true,
    );
  });

  it("draft denies anonymous even if public", async () => {
    assertEquals(
      await canReadPageRest(null, {
        readLock: "public",
        draft: true,
      }),
      false,
    );
  });

  it("default lock is connected", async () => {
    assertEquals(await canReadPageRest(null, {}), false);
    assertEquals(await canReadPageRest("1", {}), true);
  });
});
