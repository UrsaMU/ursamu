/**
 * Tests — Nomad Pack Support Utilities (lib/pack.ts)
 */
import { assertEquals, assertGreaterOrEqual, assertLessOrEqual } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  PACK_COOLDOWN_MS,
  PACK_MIN_RANK,
  PACK_REQUEST_TYPES,
  isPackOnCooldown,
  packCooldownRemaining,
  canRequestPack,
  type PackRequestType,
} from "../engine/pack.ts";

// ── Constants ─────────────────────────────────────────────────────────────────

describe("PACK_COOLDOWN_MS", () => {
  it("is 24 hours in milliseconds", () => {
    assertEquals(PACK_COOLDOWN_MS, 24 * 60 * 60 * 1_000);
  });
});

describe("PACK_REQUEST_TYPES", () => {
  it("contains all four types", () => {
    const types = [...PACK_REQUEST_TYPES];
    assertEquals(types.includes("supplies"), true);
    assertEquals(types.includes("backup"),   true);
    assertEquals(types.includes("medical"),  true);
    assertEquals(types.includes("haven"),    true);
    assertEquals(types.length, 4);
  });
});

describe("PACK_MIN_RANK", () => {
  it("supplies requires rank 1", () => assertEquals(PACK_MIN_RANK.supplies, 1));
  it("backup requires rank 4",   () => assertEquals(PACK_MIN_RANK.backup, 4));
  it("medical requires rank 4",  () => assertEquals(PACK_MIN_RANK.medical, 4));
  it("haven requires rank 7",    () => assertEquals(PACK_MIN_RANK.haven, 7));
});

// ── isPackOnCooldown ──────────────────────────────────────────────────────────

describe("isPackOnCooldown()", () => {
  it("returns false when lastUsed is undefined", () => {
    assertEquals(isPackOnCooldown(undefined), false);
  });

  it("returns true when last use was recent", () => {
    const now = Date.now();
    assertEquals(isPackOnCooldown(now - 60_000, now), true);
  });

  it("returns true when last use was exactly 1ms ago", () => {
    const now = Date.now();
    assertEquals(isPackOnCooldown(now - 1, now), true);
  });

  it("returns false when cooldown has fully elapsed", () => {
    const now = Date.now();
    assertEquals(isPackOnCooldown(now - PACK_COOLDOWN_MS - 1, now), false);
  });

  it("returns false at the exact cooldown boundary", () => {
    const now = Date.now();
    assertEquals(isPackOnCooldown(now - PACK_COOLDOWN_MS, now), false);
  });
});

// ── packCooldownRemaining ─────────────────────────────────────────────────────

describe("packCooldownRemaining()", () => {
  it("returns positive ms when on cooldown", () => {
    const now = Date.now();
    const rem = packCooldownRemaining(now - 60_000, now);
    assertGreaterOrEqual(rem, 0);
    assertLessOrEqual(rem, PACK_COOLDOWN_MS);
  });

  it("returns 0 when cooldown has expired", () => {
    const now = Date.now();
    assertEquals(packCooldownRemaining(now - PACK_COOLDOWN_MS - 1_000, now), 0);
  });

  it("never returns a negative value", () => {
    const now = Date.now();
    const rem = packCooldownRemaining(now - PACK_COOLDOWN_MS * 2, now);
    assertGreaterOrEqual(rem, 0);
  });
});

// ── canRequestPack ────────────────────────────────────────────────────────────

describe("canRequestPack()", () => {
  const cases: Array<[PackRequestType, number, boolean]> = [
    // supplies (rank 1+)
    ["supplies", 0, false],
    ["supplies", 1, true],
    ["supplies", 10, true],
    // backup (rank 4+)
    ["backup", 3, false],
    ["backup", 4, true],
    ["backup", 7, true],
    // medical (rank 4+)
    ["medical", 3, false],
    ["medical", 4, true],
    // haven (rank 7+)
    ["haven", 6, false],
    ["haven", 7, true],
    ["haven", 10, true],
  ];

  for (const [type, rank, expected] of cases) {
    it(`${type} rank ${rank} → ${expected}`, () => {
      assertEquals(canRequestPack(rank, type), expected);
    });
  }
});
