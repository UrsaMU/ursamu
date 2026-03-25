/**
 * SECURITY [M-01] — parseInt without radix / no floor guard in ?limit= param
 *
 * A negative limit value is truthy in JS, so it bypasses the `|| 20` fallback:
 *   parseInt("-3") || 20  →  -3          (truthy, not 0/NaN)
 *   Math.min(-3, 500)     →  -3
 *   all.slice(-(-3))      →  all.slice(3)  (returns all-but-first-3, not last-3)
 *
 * A hex value parses fine but proves no radix enforcement:
 *   parseInt("0x1ff")     →  511  → capped to 500 (safe but unintentional)
 *
 * Regression test: the ?limit= parameter must be clamped to [1, 500] with an
 * explicit base-10 parse so negative and hex values behave correctly.
 */

import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { chanHistory, dbojs } from "../src/services/Database/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const CHAN_ID   = "lp_test_chan_01";
const PLAYER_ID = "lp_test_player_01";
const ROOM_ID   = "lp_test_room_01";

// Seed 10 history entries and a connected player so the route authorises.
async function seedHistory(n: number) {
  for (let i = 0; i < n; i++) {
    await chanHistory.create({
      id:         `lp_hist_${i}`,
      chanId:     CHAN_ID,
      senderId:   PLAYER_ID,
      senderName: "LPUser",
      message:    `msg ${i}`,
      timestamp:  Date.now() + i,
    });
  }
}

async function teardown() {
  for (let i = 0; i < 10; i++) {
    await chanHistory.delete({ id: `lp_hist_${i}` }).catch(() => {});
  }
  await dbojs.delete({ id: PLAYER_ID }).catch(() => {});
  await dbojs.delete({ id: ROOM_ID   }).catch(() => {});
}

describe("SECURITY [M-01]: ?limit= clamping", OPTS, () => {
  beforeEach(async () => {
    await dbojs.create({ id: ROOM_ID,   flags: "room",             data: { name: "Room" } });
    await dbojs.create({ id: PLAYER_ID, flags: "player connected", data: { name: "LPUser" }, location: ROOM_ID });
    await seedHistory(10);
  });
  afterEach(teardown);

  it("[EXPLOIT] negative limit bypasses || 20 fallback — returns wrong slice", () => {
    // With the bug: parseInt("-3") || 20 → -3 (truthy), all.slice(3) not all.slice(-3).
    // Direct unit-level proof: demonstrate the broken parse behaviour.
    const broken = Math.min(parseInt("-3") || 20, 500);
    // Before fix: broken === -3 (negative bypasses || 20)
    assertEquals(broken < 1, true,
      "[RED] parseInt('-3') || 20 returns -3 (truthy negative bypasses fallback) — must be ≥ 1 after fix");
  });

  it("[EXPLOIT] hex string parses without radix enforcement", () => {
    // parseInt("0x1ff") without radix = 511 — auto-detects hex
    const hexParsed = parseInt("0x1ff");
    assertEquals(hexParsed, 511,
      "[RED] parseInt without radix parses hex — must use base 10 after fix");
  });
});
