/**
 * tests/gameclock.test.ts
 *
 * Tests for the persistent in-game clock (GameClock service).
 */
import { assertEquals, assertMatch, assertGreater } from "@std/assert";
import { DBO } from "../src/services/Database/database.ts";
import { gameClock } from "../src/services/GameClock/index.ts";
import { setConfig } from "../src/services/Config/mod.ts";

// ---------------------------------------------------------------------------
// Shared KV (in-memory) — must be set before any DBO operation
// ---------------------------------------------------------------------------

const kv = await Deno.openKv(":memory:");
Deno.openKv = () => Promise.resolve(kv);
// deno-lint-ignore no-explicit-any
(DBO as any).kv = null;

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("gameClock.load() initialises to Year 1, Month 1, Day 1, 00:00 on fresh DB", OPTS, async () => {
  // Reset static KV so we get a clean DBO handle
  // deno-lint-ignore no-explicit-any
  (DBO as any).kv = null;
  await gameClock.load();
  const t = gameClock.now();
  assertEquals(t.year,   1);
  assertEquals(t.month,  1);
  assertEquals(t.day,    1);
  assertEquals(t.hour,   0);
  assertEquals(t.minute, 0);
});

Deno.test("gameClock.tick(60_000) advances by 1 game-minute (multiplier=1)", OPTS, async () => {
  await gameClock.load(); // fresh epoch = 0
  setConfig("game.timeMultiplier", 1.0);
  gameClock.tick(60_000);
  const t = gameClock.now();
  assertEquals(t.minute, 1);
});

Deno.test("gameClock.tick(3_600_000) advances by 60 game-minutes (1 hour, multiplier=1)", OPTS, () => {
  // Reset to 0
  gameClock.set({ year: 1, month: 1, day: 1, hour: 0, minute: 0 });
  setConfig("game.timeMultiplier", 1.0);
  gameClock.tick(3_600_000);
  const t = gameClock.now();
  assertEquals(t.hour,   1);
  assertEquals(t.minute, 0);
});

Deno.test("gameClock.tick respects custom multiplier (2x)", OPTS, () => {
  gameClock.set({ year: 1, month: 1, day: 1, hour: 0, minute: 0 });
  setConfig("game.timeMultiplier", 2.0);
  gameClock.tick(60_000); // 1 real minute × 2 = 2 game minutes
  const t = gameClock.now();
  assertEquals(t.minute, 2);
  // Restore default
  setConfig("game.timeMultiplier", 1.0);
});

Deno.test("gameClock.format() returns a non-empty string", OPTS, () => {
  gameClock.set({ year: 3, month: 5, day: 10, hour: 14, minute: 30 });
  const str = gameClock.format();
  assertMatch(str, /Year 3, Month 5, Day 10, 14:30/);
  assertGreater(str.length, 0);
});

Deno.test("gameClock.set() updates individual fields", OPTS, () => {
  gameClock.set({ year: 1, month: 1, day: 1, hour: 0, minute: 0 });
  gameClock.set({ hour: 12 });
  const t = gameClock.now();
  assertEquals(t.hour, 12);
  // Other fields unchanged
  assertEquals(t.year,  1);
  assertEquals(t.month, 1);
  assertEquals(t.day,   1);
});

Deno.test("gameClock.save() and load() round-trip", OPTS, async () => {
  gameClock.set({ year: 7, month: 4, day: 15, hour: 8, minute: 45 });
  await gameClock.save();

  // Simulate reset (zero the internal epoch by loading fresh)
  gameClock.set({ year: 1, month: 1, day: 1, hour: 0, minute: 0 });
  await gameClock.load();

  const t = gameClock.now();
  assertEquals(t.year,   7);
  assertEquals(t.month,  4);
  assertEquals(t.day,    15);
  assertEquals(t.hour,   8);
  assertEquals(t.minute, 45);
});

Deno.test("u.sys.gameTime() via createNativeSDK returns current game time", OPTS, async () => {
  gameClock.set({ year: 2, month: 6, day: 3, hour: 10, minute: 20 });

  const { createNativeSDK } = await import("../src/services/SDK/index.ts");
  const u = await createNativeSDK("sock-gc1", "gc_actor1", { name: "@time", args: [] });

  const gt = await u.sys.gameTime();
  assertEquals(gt.year,   2);
  assertEquals(gt.month,  6);
  assertEquals(gt.day,    3);
  assertEquals(gt.hour,   10);
  assertEquals(gt.minute, 20);
});

// Close the shared DB after all tests
Deno.test("cleanup — close DB", OPTS, async () => {
  await DBO.close();
});
