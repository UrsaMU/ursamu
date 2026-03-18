/**
 * tests/discord_webhook.test.ts
 *
 * Tests for the Discord webhook plugin:
 *  - channelEvents: on/off/emit, error isolation
 *  - discordConfig: CRUD round-trips, case folding
 *  - webhook.ts: postWebhook doesn't throw
 *  - discordRouteHandler: auth, CRUD, test endpoint
 */
import { assertEquals, assertExists } from "@std/assert";
import { channelEvents } from "../src/services/channel-events.ts";
import {
  getDiscordConfig,
  getWebhookUrl,
  setWebhook,
  clearWebhook,
  setPublicUrl,
} from "../src/plugins/discord/config.ts";
import { postWebhook } from "../src/plugins/discord/webhook.ts";
import { discordRouteHandler } from "../src/plugins/discord/router.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const STAFF_ID  = "dwh_staff1";
const PLAYER_ID = "dwh_player1";

// ─── helpers ─────────────────────────────────────────────────────────────────

function req(
  method: string,
  path: string,
  userId: string | null,
  body?: unknown,
): Promise<Response> {
  return discordRouteHandler(
    new Request(`http://localhost${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
    userId,
  );
}

async function call<T>(
  method: string,
  path: string,
  userId: string | null,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const res  = await req(method, path, userId, body);
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

// ─── setup ────────────────────────────────────────────────────────────────────

Deno.test("Discord — setup fixtures", OPTS, async () => {
  await dbojs.delete({ id: STAFF_ID  }).catch(() => {});
  await dbojs.delete({ id: PLAYER_ID }).catch(() => {});

  await dbojs.create({
    id:    STAFF_ID,
    flags: "player connected admin",
    data:  { name: "DiscordStaff" },
  });
  await dbojs.create({
    id:    PLAYER_ID,
    flags: "player connected",
    data:  { name: "DiscordPlayer" },
  });

  // Clear any leftover test webhooks from previous runs
  await clearWebhook("dwhtest").catch(() => {});
  await clearWebhook("dwh_topic").catch(() => {});
});

// ─── channelEvents ────────────────────────────────────────────────────────────

Deno.test("channelEvents — emit calls registered handler", OPTS, async () => {
  let calls = 0;
  const handler = () => { calls++; };
  channelEvents.on("channel:message", handler);
  await channelEvents.emit("channel:message", {
    channelName: "ooc",
    senderId:    "x1",
    senderName:  "Tester",
    message:     "hello",
  });
  assertEquals(calls, 1);
  channelEvents.off("channel:message", handler);
});

Deno.test("channelEvents — off stops handler from being called", OPTS, async () => {
  let calls = 0;
  const handler = () => { calls++; };
  channelEvents.on("channel:message", handler);
  channelEvents.off("channel:message", handler);
  await channelEvents.emit("channel:message", {
    channelName: "ooc",
    senderId:    "x1",
    senderName:  "Tester",
    message:     "hello",
  });
  assertEquals(calls, 0);
});

Deno.test("channelEvents — multiple handlers all fire", OPTS, async () => {
  let a = 0, b = 0;
  const ha = () => { a++; };
  const hb = () => { b++; };
  channelEvents.on("channel:message", ha);
  channelEvents.on("channel:message", hb);
  await channelEvents.emit("channel:message", {
    channelName: "pub",
    senderId:    "x2",
    senderName:  "X",
    message:     "msg",
  });
  assertEquals(a, 1);
  assertEquals(b, 1);
  channelEvents.off("channel:message", ha);
  channelEvents.off("channel:message", hb);
});

Deno.test("channelEvents — throwing handler doesn't stop other handlers", OPTS, async () => {
  let ok = 0;
  const bad  = () => { throw new Error("boom"); };
  const good = () => { ok++; };
  channelEvents.on("channel:message", bad);
  channelEvents.on("channel:message", good);
  await channelEvents.emit("channel:message", {
    channelName: "test",
    senderId:    "y",
    senderName:  "Y",
    message:     "msg",
  });
  assertEquals(ok, 1);
  channelEvents.off("channel:message", bad);
  channelEvents.off("channel:message", good);
});

// ─── discordConfig ────────────────────────────────────────────────────────────

Deno.test("discordConfig — getDiscordConfig returns object with webhooks map", OPTS, async () => {
  const cfg = await getDiscordConfig();
  assertExists(cfg);
  assertEquals(typeof cfg.webhooks, "object");
  assertEquals(typeof cfg.publicUrl, "string");
});

Deno.test("discordConfig — setWebhook persists and getWebhookUrl retrieves it", OPTS, async () => {
  await setWebhook("dwhtest", "https://discord.com/api/webhooks/111/aaa");
  const url = await getWebhookUrl("dwhtest");
  assertEquals(url, "https://discord.com/api/webhooks/111/aaa");
});

Deno.test("discordConfig — clearWebhook removes the entry", OPTS, async () => {
  await clearWebhook("dwhtest");
  const url = await getWebhookUrl("dwhtest");
  assertEquals(url, undefined);
});

Deno.test("discordConfig — topic names are stored lowercase", OPTS, async () => {
  await setWebhook("DWH_TOPIC", "https://discord.com/api/webhooks/222/bbb");
  const url = await getWebhookUrl("dwh_topic");
  assertEquals(url, "https://discord.com/api/webhooks/222/bbb");
  await clearWebhook("dwh_topic");
});

Deno.test("discordConfig — setPublicUrl persists", OPTS, async () => {
  await setPublicUrl("https://mygame-test.com");
  const cfg = await getDiscordConfig();
  assertEquals(cfg.publicUrl, "https://mygame-test.com");
  await setPublicUrl("");
});

Deno.test("discordConfig — getWebhookUrl returns undefined for unknown topic", OPTS, async () => {
  const url = await getWebhookUrl("no_such_topic_xyz");
  assertEquals(url, undefined);
});

// ─── postWebhook ──────────────────────────────────────────────────────────────

Deno.test("postWebhook — does not throw with unreachable URL", OPTS, () => {
  // Fire-and-forget; errors are caught internally
  let threw = false;
  try {
    postWebhook("http://127.0.0.1:0/fake", { content: "test" });
  } catch {
    threw = true;
  }
  assertEquals(threw, false);
});

Deno.test("postWebhook — queues multiple calls without throwing", OPTS, () => {
  let threw = false;
  try {
    const url = "http://127.0.0.1:0/fake";
    postWebhook(url, { content: "msg1" });
    postWebhook(url, { content: "msg2" });
    postWebhook(url, { content: "msg3" });
  } catch {
    threw = true;
  }
  assertEquals(threw, false);
});

// ─── discordRouteHandler ──────────────────────────────────────────────────────

Deno.test("Discord REST — 401 when no userId", OPTS, async () => {
  const { status } = await call("GET", "/api/v1/discord/webhooks", null);
  assertEquals(status, 401);
});

Deno.test("Discord REST — 403 for non-staff", OPTS, async () => {
  const { status } = await call("GET", "/api/v1/discord/webhooks", PLAYER_ID);
  assertEquals(status, 403);
});

Deno.test("Discord REST — GET /webhooks returns config for staff", OPTS, async () => {
  await setWebhook("jobs", "https://discord.com/api/webhooks/999/testtoken");
  const { status, data } = await call<{ webhooks: Record<string, string>; publicUrl: string }>(
    "GET", "/api/v1/discord/webhooks", STAFF_ID,
  );
  assertEquals(status, 200);
  assertExists(data.webhooks);
  // URLs are truncated in the response
  assertExists(data.webhooks["jobs"]);
  assertEquals(data.webhooks["jobs"].endsWith("…"), true);
  await clearWebhook("jobs");
});

Deno.test("Discord REST — POST /webhooks sets a webhook", OPTS, async () => {
  const { status, data } = await call<{ set: string }>(
    "POST", "/api/v1/discord/webhooks", STAFF_ID,
    { topic: "rest_test", url: "https://discord.com/api/webhooks/123/abc" },
  );
  assertEquals(status, 200);
  assertEquals(data.set, "rest_test");
  // Verify it was actually saved
  const url = await getWebhookUrl("rest_test");
  assertEquals(url, "https://discord.com/api/webhooks/123/abc");
  await clearWebhook("rest_test");
});

Deno.test("Discord REST — POST /webhooks with empty url clears the topic", OPTS, async () => {
  await setWebhook("to_clear", "https://discord.com/api/webhooks/1/x");
  const { status, data } = await call<{ cleared: string }>(
    "POST", "/api/v1/discord/webhooks", STAFF_ID,
    { topic: "to_clear", url: "" },
  );
  assertEquals(status, 200);
  assertEquals(data.cleared, "to_clear");
  assertEquals(await getWebhookUrl("to_clear"), undefined);
});

Deno.test("Discord REST — POST /webhooks rejects non-discord URL", OPTS, async () => {
  const { status } = await call(
    "POST", "/api/v1/discord/webhooks", STAFF_ID,
    { topic: "bad", url: "https://evil.com/webhook" },
  );
  assertEquals(status, 400);
});

Deno.test("Discord REST — POST /webhooks missing topic returns 400", OPTS, async () => {
  const { status } = await call(
    "POST", "/api/v1/discord/webhooks", STAFF_ID,
    { url: "https://discord.com/api/webhooks/1/x" },
  );
  assertEquals(status, 400);
});

Deno.test("Discord REST — DELETE /webhooks/:topic removes it", OPTS, async () => {
  await setWebhook("del_me", "https://discord.com/api/webhooks/9/z");
  const { status, data } = await call<{ deleted: string }>(
    "DELETE", "/api/v1/discord/webhooks/del_me", STAFF_ID,
  );
  assertEquals(status, 200);
  assertEquals(data.deleted, "del_me");
  assertEquals(await getWebhookUrl("del_me"), undefined);
});

Deno.test("Discord REST — DELETE /webhooks/:topic 404 for unknown topic", OPTS, async () => {
  const { status } = await call(
    "DELETE", "/api/v1/discord/webhooks/no_such_topic_xyz", STAFF_ID,
  );
  assertEquals(status, 404);
});

Deno.test("Discord REST — POST /webhooks/:topic/test returns 200 for known topic", OPTS, async () => {
  // Use an unreachable URL — postWebhook is fire-and-forget so the test won't hang
  await setWebhook("testtopic", "http://127.0.0.1:0/fake");
  const { status, data } = await call<{ sent: boolean }>(
    "POST", "/api/v1/discord/webhooks/testtopic/test", STAFF_ID,
  );
  assertEquals(status, 200);
  assertEquals(data.sent, true);
  await clearWebhook("testtopic");
});

Deno.test("Discord REST — POST /webhooks/:topic/test returns 404 for unknown topic", OPTS, async () => {
  const { status } = await call(
    "POST", "/api/v1/discord/webhooks/no_such_xyz/test", STAFF_ID,
  );
  assertEquals(status, 404);
});

Deno.test("Discord REST — unknown path returns 404", OPTS, async () => {
  const { status } = await call("GET", "/api/v1/discord/unknown", STAFF_ID);
  assertEquals(status, 404);
});

// ─── cleanup ──────────────────────────────────────────────────────────────────

Deno.test("Discord — cleanup", OPTS, async () => {
  await dbojs.delete({ id: STAFF_ID  }).catch(() => {});
  await dbojs.delete({ id: PLAYER_ID }).catch(() => {});
  await DBO.close();
});
