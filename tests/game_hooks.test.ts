/**
 * tests/game_hooks.test.ts
 *
 * Tests for the GameHooks registry (src/services/Hooks/GameHooks.ts).
 * Covers: on/emit, off, multiple handlers, error isolation, async handlers,
 * and emit with no handlers.
 */
import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import {
  gameHooks,
  type SayEvent,
  type PoseEvent,
  type PageEvent,
  type MoveEvent,
  type SessionEvent,
  type ChannelMessageEvent,
} from "../src/services/Hooks/GameHooks.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ─── sample payloads ──────────────────────────────────────────────────────────

const SAY_EVENT: SayEvent = {
  actorId: "p1",
  actorName: "Alice",
  roomId: "r1",
  message: "Hello!",
};

const POSE_EVENT: PoseEvent = {
  actorId: "p1",
  actorName: "Alice",
  roomId: "r1",
  content: "Alice grins.",
  isSemipose: false,
};

const PAGE_EVENT: PageEvent = {
  actorId: "p1",
  actorName: "Alice",
  targetId: "p2",
  targetName: "Bob",
  message: "Hi Bob.",
};

const MOVE_EVENT: MoveEvent = {
  actorId: "p1",
  actorName: "Alice",
  fromRoomId: "r1",
  toRoomId: "r2",
  fromRoomName: "Lobby",
  toRoomName: "Garden",
  exitName: "North",
};

const SESSION_EVENT: SessionEvent = {
  actorId: "p1",
  actorName: "Alice",
};

const CHAN_EVENT: ChannelMessageEvent = {
  channelName: "public",
  senderId: "p1",
  senderName: "Alice",
  message: "Hello channel!",
};

// ─── player:say ───────────────────────────────────────────────────────────────

Deno.test("GameHooks — player:say: on + emit delivers payload", OPTS, async () => {
  const received: SayEvent[] = [];
  const handler = (e: SayEvent) => { received.push(e); };
  gameHooks.on("player:say", handler);

  await gameHooks.emit("player:say", SAY_EVENT);

  gameHooks.off("player:say", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].actorName, "Alice");
  assertEquals(received[0].message, "Hello!");
});

Deno.test("GameHooks — player:say: off removes handler", OPTS, async () => {
  const received: SayEvent[] = [];
  const handler = (e: SayEvent) => { received.push(e); };
  gameHooks.on("player:say", handler);
  gameHooks.off("player:say", handler);

  await gameHooks.emit("player:say", SAY_EVENT);

  assertEquals(received.length, 0);
});

Deno.test("GameHooks — player:say: multiple handlers all fire", OPTS, async () => {
  const calls: string[] = [];
  const h1 = () => { calls.push("h1"); };
  const h2 = () => { calls.push("h2"); };
  gameHooks.on("player:say", h1);
  gameHooks.on("player:say", h2);

  await gameHooks.emit("player:say", SAY_EVENT);

  gameHooks.off("player:say", h1);
  gameHooks.off("player:say", h2);
  assertEquals(calls, ["h1", "h2"]);
});

Deno.test("GameHooks — player:say: error in one handler does not stop others", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("intentional"); };
  const good = () => { calls.push("ok"); };
  gameHooks.on("player:say", bad);
  gameHooks.on("player:say", good);

  await gameHooks.emit("player:say", SAY_EVENT);

  gameHooks.off("player:say", bad);
  gameHooks.off("player:say", good);
  assertEquals(calls, ["ok"]);
});

Deno.test("GameHooks — player:say: async handler is awaited", OPTS, async () => {
  const calls: string[] = [];
  const handler = async (_e: SayEvent) => {
    await Promise.resolve();
    calls.push("async-done");
  };
  gameHooks.on("player:say", handler);

  await gameHooks.emit("player:say", SAY_EVENT);

  gameHooks.off("player:say", handler);
  assertEquals(calls, ["async-done"]);
});

Deno.test("GameHooks — player:say: emit with no handlers is safe", OPTS, async () => {
  // No handlers registered — should not throw
  await gameHooks.emit("player:say", SAY_EVENT);
});

// ─── player:pose ──────────────────────────────────────────────────────────────

Deno.test("GameHooks — player:pose: on + emit delivers payload", OPTS, async () => {
  const received: PoseEvent[] = [];
  const handler = (e: PoseEvent) => { received.push(e); };
  gameHooks.on("player:pose", handler);

  await gameHooks.emit("player:pose", POSE_EVENT);

  gameHooks.off("player:pose", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].content, "Alice grins.");
  assertEquals(received[0].isSemipose, false);
});

Deno.test("GameHooks — player:pose: error isolation", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("pose bad"); };
  const good = () => { calls.push("pose-good"); };
  gameHooks.on("player:pose", bad);
  gameHooks.on("player:pose", good);

  await gameHooks.emit("player:pose", POSE_EVENT);

  gameHooks.off("player:pose", bad);
  gameHooks.off("player:pose", good);
  assertEquals(calls, ["pose-good"]);
});

// ─── player:page ──────────────────────────────────────────────────────────────

Deno.test("GameHooks — player:page: on + emit delivers payload", OPTS, async () => {
  const received: PageEvent[] = [];
  const handler = (e: PageEvent) => { received.push(e); };
  gameHooks.on("player:page", handler);

  await gameHooks.emit("player:page", PAGE_EVENT);

  gameHooks.off("player:page", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].targetName, "Bob");
  assertEquals(received[0].message, "Hi Bob.");
});

Deno.test("GameHooks — player:page: off removes handler", OPTS, async () => {
  const received: PageEvent[] = [];
  const handler = (e: PageEvent) => { received.push(e); };
  gameHooks.on("player:page", handler);
  gameHooks.off("player:page", handler);

  await gameHooks.emit("player:page", PAGE_EVENT);

  assertEquals(received.length, 0);
});

// ─── player:move ──────────────────────────────────────────────────────────────

Deno.test("GameHooks — player:move: on + emit delivers payload", OPTS, async () => {
  const received: MoveEvent[] = [];
  const handler = (e: MoveEvent) => { received.push(e); };
  gameHooks.on("player:move", handler);

  await gameHooks.emit("player:move", MOVE_EVENT);

  gameHooks.off("player:move", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].exitName, "North");
  assertEquals(received[0].fromRoomName, "Lobby");
  assertEquals(received[0].toRoomName, "Garden");
});

Deno.test("GameHooks — player:move: async handler is awaited", OPTS, async () => {
  const calls: string[] = [];
  const handler = async (e: MoveEvent) => {
    await Promise.resolve();
    calls.push(e.exitName);
  };
  gameHooks.on("player:move", handler);

  await gameHooks.emit("player:move", MOVE_EVENT);

  gameHooks.off("player:move", handler);
  assertEquals(calls, ["North"]);
});

// ─── player:login ─────────────────────────────────────────────────────────────

Deno.test("GameHooks — player:login: on + emit delivers payload", OPTS, async () => {
  const received: SessionEvent[] = [];
  const handler = (e: SessionEvent) => { received.push(e); };
  gameHooks.on("player:login", handler);

  await gameHooks.emit("player:login", SESSION_EVENT);

  gameHooks.off("player:login", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].actorId, "p1");
  assertEquals(received[0].actorName, "Alice");
});

Deno.test("GameHooks — player:login: multiple handlers, error isolation", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("login bad"); };
  const good = () => { calls.push("login-good"); };
  gameHooks.on("player:login", bad);
  gameHooks.on("player:login", good);

  await gameHooks.emit("player:login", SESSION_EVENT);

  gameHooks.off("player:login", bad);
  gameHooks.off("player:login", good);
  assertEquals(calls, ["login-good"]);
});

// ─── player:logout ────────────────────────────────────────────────────────────

Deno.test("GameHooks — player:logout: on + emit delivers payload", OPTS, async () => {
  const received: SessionEvent[] = [];
  const handler = (e: SessionEvent) => { received.push(e); };
  gameHooks.on("player:logout", handler);

  await gameHooks.emit("player:logout", SESSION_EVENT);

  gameHooks.off("player:logout", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].actorName, "Alice");
});

Deno.test("GameHooks — player:logout: emit with no handlers is safe", OPTS, async () => {
  await gameHooks.emit("player:logout", SESSION_EVENT);
});

// ─── channel:message ──────────────────────────────────────────────────────────

Deno.test("GameHooks — channel:message: on + emit delivers payload", OPTS, async () => {
  const received: ChannelMessageEvent[] = [];
  const handler = (e: ChannelMessageEvent) => { received.push(e); };
  gameHooks.on("channel:message", handler);

  await gameHooks.emit("channel:message", CHAN_EVENT);

  gameHooks.off("channel:message", handler);
  assertEquals(received.length, 1);
  assertEquals(received[0].channelName, "public");
  assertEquals(received[0].message, "Hello channel!");
});

Deno.test("GameHooks — channel:message: off removes handler", OPTS, async () => {
  const received: ChannelMessageEvent[] = [];
  const handler = (e: ChannelMessageEvent) => { received.push(e); };
  gameHooks.on("channel:message", handler);
  gameHooks.off("channel:message", handler);

  await gameHooks.emit("channel:message", CHAN_EVENT);

  assertEquals(received.length, 0);
});

Deno.test("GameHooks — channel:message: multiple handlers both fire", OPTS, async () => {
  const calls: string[] = [];
  const h1 = () => { calls.push("chan-h1"); };
  const h2 = () => { calls.push("chan-h2"); };
  gameHooks.on("channel:message", h1);
  gameHooks.on("channel:message", h2);

  await gameHooks.emit("channel:message", CHAN_EVENT);

  gameHooks.off("channel:message", h1);
  gameHooks.off("channel:message", h2);
  assertEquals(calls, ["chan-h1", "chan-h2"]);
});

Deno.test("GameHooks — channel:message: async handler is awaited", OPTS, async () => {
  const calls: string[] = [];
  const handler = async (e: ChannelMessageEvent) => {
    await Promise.resolve();
    calls.push(e.channelName);
  };
  gameHooks.on("channel:message", handler);

  await gameHooks.emit("channel:message", CHAN_EVENT);

  gameHooks.off("channel:message", handler);
  assertEquals(calls, ["public"]);
});

Deno.test("GameHooks — channel:message: error isolation", OPTS, async () => {
  const calls: string[] = [];
  const bad = () => { throw new Error("chan bad"); };
  const good = () => { calls.push("chan-good"); };
  gameHooks.on("channel:message", bad);
  gameHooks.on("channel:message", good);

  await gameHooks.emit("channel:message", CHAN_EVENT);

  gameHooks.off("channel:message", bad);
  gameHooks.off("channel:message", good);
  assertEquals(calls, ["chan-good"]);
});
