/**
 * SECURITY — L1: per-player watcher subscription cap.
 *
 * The original code only caps watchers per page (50), not per player.
 * A player can subscribe to unlimited pages, causing storage exhaustion.
 * The patch adds MAX_PLAYER_SUBS (200) as a per-player limit.
 */
import { assertEquals } from "@std/assert";
import { describe, it, beforeAll, afterAll } from "@std/testing/bdd";
import { DBO } from "@ursamu/mush";
import { wikiRouteHandler } from "../src/router.ts";
import { subscriptions, MAX_PLAYER_SUBS } from "../src/db.ts";

const TEST_USER = "__security_l1_test_player__";

function watchReq(path: string): Request {
  return new Request(`http://localhost/api/v1/wiki/${path}/watch`, { method: "POST" });
}

describe("handleWatch — per-player subscription cap", () => {
  beforeAll(async () => {
    // Seed exactly MAX_PLAYER_SUBS subscriptions sequentially to avoid
    // concurrent KV-open issues with the DBO singleton
    for (let i = 0; i < MAX_PLAYER_SUBS; i++) {
      await subscriptions.create({
        id:        crypto.randomUUID(),
        playerId:  TEST_USER,
        path:      `__l1_pad_${i}__`,
        createdAt: Date.now(),
      });
    }
  });

  afterAll(async () => {
    const all = await subscriptions.find({ playerId: TEST_USER });
    for (const s of all) await subscriptions.delete({ id: s.id });
    await DBO.close();
  });

  it("EXPLOIT: player at cap cannot subscribe to another page (currently returns 201)", async () => {
    const res = await wikiRouteHandler(watchReq("__l1_overflow__"), TEST_USER);
    // Currently returns 201 — exploit. After patch returns 422.
    assertEquals(res.status, 422);
  });

  it("PATCH: player below cap can still subscribe", async () => {
    // A fresh player with 0 subscriptions should succeed
    const freshUser = "__security_l1_fresh_player__";
    const res = await wikiRouteHandler(watchReq("__l1_fresh_page__"), freshUser);
    // 201 or 200 (toggle off existing) — just not 422
    assertEquals(res.status !== 422, true);
    // Clean up
    const sub = await subscriptions.findOne({ playerId: freshUser });
    if (sub) await subscriptions.delete({ id: sub.id });
  });
});
