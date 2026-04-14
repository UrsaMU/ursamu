/**
 * tests/game_context.test.ts
 *
 * Tests for src/engine/context.ts — GameContext interface and buildContext().
 *
 * Verifies that buildContext() correctly hydrates the actor and room from the
 * database, falls back to stubs when objects are missing, passes the cmd
 * descriptor through unchanged, and that createNativeSDK still delegates to
 * it correctly (backward compat).
 */
import { assertEquals, assertInstanceOf, assertExists } from "@std/assert";
import { buildContext } from "../src/engine/context.ts";
import { createNativeSDK } from "../src/services/SDK/index.ts";
import { dbojs } from "../src/services/Database/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "gc_room1";
const ACTOR_ID = "gc_actor1";
const SOCKET_ID = "gc_socket1";

const CMD = { name: "look", original: "look here", args: ["here"], switches: [] };

async function cleanup() {
  await dbojs.delete({ id: ROOM_ID }).catch(() => {});
  await dbojs.delete({ id: ACTOR_ID }).catch(() => {});
}

// ---------------------------------------------------------------------------
// buildContext — happy path
// ---------------------------------------------------------------------------

Deno.test("buildContext — hydrates actor correctly", OPTS, async () => {
  await cleanup();
  await dbojs.create({
    id: ROOM_ID,
    flags: "room",
    data: { name: "TestRoom" },
  });
  await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Alice" },
    location: ROOM_ID,
  });

  const ctx = await buildContext(SOCKET_ID, ACTOR_ID, CMD);

  assertEquals(ctx.actor.id, ACTOR_ID);
  assertEquals(ctx.actor.name, "Alice");
  assertInstanceOf(ctx.actor.flags, Set);
  assertEquals(ctx.actor.flags.has("player"), true);
  assertEquals(ctx.actor.flags.has("connected"), true);
  assertEquals(ctx.actor.location, ROOM_ID);

  await cleanup();
});

Deno.test("buildContext — hydrates room correctly", OPTS, async () => {
  await cleanup();
  await dbojs.create({
    id: ROOM_ID,
    flags: "room",
    data: { name: "TestRoom" },
  });
  await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Alice" },
    location: ROOM_ID,
  });

  const ctx = await buildContext(SOCKET_ID, ACTOR_ID, CMD);

  assertEquals(ctx.room.id, ROOM_ID);
  assertInstanceOf(ctx.room.flags, Set);
  assertEquals(ctx.room.flags.has("room"), true);
  // room has a bound broadcast helper
  assertEquals(typeof ctx.room.broadcast, "function");

  await cleanup();
});

Deno.test("buildContext — passes socketId and cmd through unchanged", OPTS, async () => {
  await cleanup();
  await dbojs.create({
    id: ROOM_ID,
    flags: "room",
    data: { name: "TestRoom" },
  });
  await dbojs.create({
    id: ACTOR_ID,
    flags: "player",
    data: { name: "Alice" },
    location: ROOM_ID,
  });

  const ctx = await buildContext(SOCKET_ID, ACTOR_ID, CMD);

  assertEquals(ctx.socketId, SOCKET_ID);
  assertEquals(ctx.cmd.name, "look");
  assertEquals(ctx.cmd.original, "look here");
  assertEquals(ctx.cmd.args, ["here"]);
  assertEquals(ctx.cmd.switches, []);

  await cleanup();
});

Deno.test("buildContext — exposes actor data.state as context state", OPTS, async () => {
  await cleanup();
  await dbojs.create({
    id: ROOM_ID,
    flags: "room",
    data: { name: "TestRoom" },
  });
  await dbojs.create({
    id: ACTOR_ID,
    flags: "player",
    data: { name: "Alice", state: { hp: 100, xp: 500 } },
    location: ROOM_ID,
  });

  const ctx = await buildContext(SOCKET_ID, ACTOR_ID, CMD);

  assertEquals((ctx.state as { hp: number }).hp, 100);
  assertEquals((ctx.state as { xp: number }).xp, 500);

  await cleanup();
});

// ---------------------------------------------------------------------------
// buildContext — fallback / stub paths
// ---------------------------------------------------------------------------

Deno.test("buildContext — unknown actorId produces stub actor", OPTS, async () => {
  const ctx = await buildContext(SOCKET_ID, "gc_nobody", CMD);

  assertEquals(ctx.actor.id, "gc_nobody");
  assertInstanceOf(ctx.actor.flags, Set);
  assertEquals(ctx.actor.flags.size, 0);
  assertEquals(ctx.actor.location, undefined);
  // state defaults to empty object
  assertEquals(Object.keys(ctx.state).length, 0);
});

Deno.test("buildContext — actor with no location produces limbo room stub", OPTS, async () => {
  await cleanup();
  await dbojs.create({
    id: ACTOR_ID,
    flags: "player",
    data: { name: "Homeless" },
    // no location field
  });

  const ctx = await buildContext(SOCKET_ID, ACTOR_ID, CMD);

  assertEquals(ctx.room.id, "limbo");
  assertInstanceOf(ctx.room.flags, Set);
  assertEquals(ctx.room.flags.size, 0);

  await cleanup();
});

// ---------------------------------------------------------------------------
// buildContext — send / broadcast are callable functions
// ---------------------------------------------------------------------------

Deno.test("buildContext — send and broadcast are functions", OPTS, async () => {
  const ctx = await buildContext(SOCKET_ID, "gc_nobody", CMD);

  assertEquals(typeof ctx.send, "function");
  assertEquals(typeof ctx.broadcast, "function");

  // Calling these with no live socket should not throw
  try { ctx.send("test"); } catch { /* no socket — OK */ }
  try { ctx.broadcast("test"); } catch { /* no socket — OK */ }
});

// ---------------------------------------------------------------------------
// createNativeSDK backward compat — still returns a valid IUrsamuSDK
// ---------------------------------------------------------------------------

Deno.test("createNativeSDK — still resolves and returns valid SDK", OPTS, async () => {
  await cleanup();
  await dbojs.create({
    id: ROOM_ID,
    flags: "room",
    data: { name: "TestRoom" },
  });
  await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Alice" },
    location: ROOM_ID,
  });

  const u = await createNativeSDK(SOCKET_ID, ACTOR_ID, CMD);

  // Core identity fields
  assertEquals(u.me.id, ACTOR_ID);
  assertEquals(u.here.id, ROOM_ID);
  assertEquals(u.socketId, SOCKET_ID);
  assertEquals(u.cmd.name, "look");
  assertEquals(u.cmd.args, ["here"]);

  // SDK surface is present
  assertEquals(typeof u.send, "function");
  assertEquals(typeof u.broadcast, "function");
  assertEquals(typeof u.db.search, "function");
  assertEquals(typeof u.db.modify, "function");
  assertEquals(typeof u.util.target, "function");
  assertExists(u.auth);
  assertExists(u.sys);
  assertExists(u.chan);

  await cleanup();
});

Deno.test("createNativeSDK — unknown actor produces fallback SDK without throwing", OPTS, async () => {
  const u = await createNativeSDK(SOCKET_ID, "gc_nobody", CMD);

  assertEquals(u.me.id, "gc_nobody");
  assertEquals(u.here.id, "limbo");
  assertInstanceOf(u.me.flags, Set);
});
