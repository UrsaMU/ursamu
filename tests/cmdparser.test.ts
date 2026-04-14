/**
 * tests/cmdparser.test.ts
 *
 * Tests for the command parsing system:
 *   - systemAliases loading (scripts export `aliases` arrays)
 *   - matchExits() — player traverses exits in a room
 *   - matchChannel() — player sends to a channel via alias
 */
import { assertEquals } from "@std/assert";
import {
  loadSystemAliases,
  systemAliases,
} from "../src/services/commands/cmdParser.ts";
import { matchExits } from "../src/services/commands/movement.ts";
import { matchChannel } from "../src/services/commands/channels.ts";
import { dbojs, chans, DBO } from "../src/services/Database/database.ts";
import type { IContext } from "../src/@types/IContext.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// DB ID prefix for this file
const ROOM_ID   = "cp_room1";
const ROOM2_ID  = "cp_room2";
const PLAYER_ID = "cp_player1";
const EXIT_ID   = "cp_exit1";
const CHAN_ID    = "cp_chan1";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

// ===========================================================================
// systemAliases — alias loading from scripts
// ===========================================================================

Deno.test("systemAliases — loadSystemAliases runs without error (no system scripts)", OPTS, async () => {
  // System scripts have been removed; all commands are native addCmd registrations.
  // loadSystemAliases should complete cleanly with no aliases populated.
  await loadSystemAliases();
  assertEquals(typeof systemAliases, "object");
  // No system scripts → no script-based aliases
  assertEquals(systemAliases["chancreate"], undefined);
  assertEquals(systemAliases["mail/send"], undefined);
});

// ===========================================================================
// matchExits — exit traversal
// ===========================================================================

// Helper: build a mock IContext
function makeCtx(cid: string, msg: string): IContext {
  return {
    socket: {
      id: `sock-${cid}`,
      cid,
      join: (_room: string) => {},
      leave: (_room: string) => {},
      // deno-lint-ignore no-explicit-any
    } as any,
    msg,
    // deno-lint-ignore no-explicit-any
    data: {} as any,
  };
}

Deno.test("matchExits — no character → returns false", OPTS, async () => {
  const ctx = makeCtx("cp_nobody", "north");
  const result = await matchExits(ctx);
  assertEquals(result, false);
});

Deno.test("matchExits — no exits in room → returns false", OPTS, async () => {
  await dbojs.create({ id: PLAYER_ID, flags: "player connected", data: { name: "Wanderer" }, location: ROOM_ID });

  const ctx = makeCtx(PLAYER_ID, "north");
  const result = await matchExits(ctx);
  assertEquals(result, false);

  await cleanup(PLAYER_ID);
});

Deno.test("matchExits — input doesn't match any exit → returns false", OPTS, async () => {
  await dbojs.create({ id: ROOM_ID,   flags: "room",            data: { name: "Room A" } });
  await dbojs.create({ id: PLAYER_ID, flags: "player connected", data: { name: "Walker"  }, location: ROOM_ID });
  await dbojs.create({ id: EXIT_ID,   flags: "exit",            data: { name: "east;e", destination: ROOM2_ID }, location: ROOM_ID });

  const ctx = makeCtx(PLAYER_ID, "north"); // "north" doesn't match "east;e"
  const result = await matchExits(ctx);
  assertEquals(result, false);

  await cleanup(ROOM_ID, PLAYER_ID, EXIT_ID);
});

Deno.test("matchExits — matching exit moves player to destination", OPTS, async () => {
  await dbojs.create({ id: ROOM_ID,   flags: "room",            data: { name: "Room A" } });
  await dbojs.create({ id: ROOM2_ID,  flags: "room",            data: { name: "Room B" } });
  await dbojs.create({ id: PLAYER_ID, flags: "player connected", data: { name: "Mover"   }, location: ROOM_ID });
  await dbojs.create({ id: EXIT_ID,   flags: "exit",            data: { name: "north;n", destination: ROOM2_ID }, location: ROOM_ID });

  const ctx = makeCtx(PLAYER_ID, "north");
  const result = await matchExits(ctx);
  assertEquals(result, true);

  // Verify player location updated in DB
  const updated = await dbojs.queryOne({ id: PLAYER_ID });
  assertEquals(updated?.location, ROOM2_ID);

  await cleanup(ROOM_ID, ROOM2_ID, PLAYER_ID, EXIT_ID);
});

Deno.test("matchExits — exit alias (;) also triggers movement", OPTS, async () => {
  await dbojs.create({ id: ROOM_ID,   flags: "room",            data: { name: "Room A" } });
  await dbojs.create({ id: ROOM2_ID,  flags: "room",            data: { name: "Room B" } });
  await dbojs.create({ id: PLAYER_ID, flags: "player connected", data: { name: "Mover"   }, location: ROOM_ID });
  await dbojs.create({ id: EXIT_ID,   flags: "exit",            data: { name: "north;n", destination: ROOM2_ID }, location: ROOM_ID });

  const ctx = makeCtx(PLAYER_ID, "n"); // use the alias
  const result = await matchExits(ctx);
  assertEquals(result, true);

  const updated = await dbojs.queryOne({ id: PLAYER_ID });
  assertEquals(updated?.location, ROOM2_ID);

  await cleanup(ROOM_ID, ROOM2_ID, PLAYER_ID, EXIT_ID);
});

Deno.test("matchExits — locked exit (lock fails) returns true but doesn't move", OPTS, async () => {
  // "admin+" lock: the player is plain "player connected", so flags.check fails
  await dbojs.create({ id: ROOM_ID,   flags: "room",            data: { name: "Room A" } });
  await dbojs.create({ id: ROOM2_ID,  flags: "room",            data: { name: "Room B" } });
  await dbojs.create({ id: PLAYER_ID, flags: "player connected", data: { name: "Blocked" }, location: ROOM_ID });
  await dbojs.create({ id: EXIT_ID,   flags: "exit",            data: { name: "vault", destination: ROOM2_ID, lock: "admin+" }, location: ROOM_ID });

  const ctx = makeCtx(PLAYER_ID, "vault");
  const result = await matchExits(ctx);
  assertEquals(result, true); // exit was matched (returns true), but movement was blocked

  const updated = await dbojs.queryOne({ id: PLAYER_ID });
  assertEquals(updated?.location, ROOM_ID); // still in original room

  await cleanup(ROOM_ID, ROOM2_ID, PLAYER_ID, EXIT_ID);
});

// ===========================================================================
// matchChannel — channel message routing
// ===========================================================================

Deno.test("matchChannel — no character → returns undefined/false", OPTS, async () => {
  const ctx = makeCtx("cp_nobody", "pub Hello");
  const result = await matchChannel(ctx);
  // matchChannel returns undefined when en is not found
  assertEquals(!result, true);
});

Deno.test("matchChannel — player with no channels → returns false", OPTS, async () => {
  await dbojs.create({ id: PLAYER_ID, flags: "player connected", data: { name: "Silent" }, location: ROOM_ID });

  const ctx = makeCtx(PLAYER_ID, "pub Hello");
  const result = await matchChannel(ctx);
  assertEquals(result, false);

  await cleanup(PLAYER_ID);
});

Deno.test("matchChannel — alias not in player channels → returns false", OPTS, async () => {
  await dbojs.create({
    id: PLAYER_ID,
    flags: "player connected",
    data: { name: "Chatter", channels: [{ channel: "public", alias: "pub", active: true }] },
    location: ROOM_ID
  });

  // "staff" alias doesn't match "pub" channel
  const ctx = makeCtx(PLAYER_ID, "staff Hello");
  const result = await matchChannel(ctx);
  assertEquals(result, false);

  await cleanup(PLAYER_ID);
});

Deno.test("matchChannel — matching alias routes to channel broadcast", OPTS, async () => {
  // Create channel in chans DB
  await chans.create({ id: CHAN_ID, name: "public", header: "[PUB]", lock: "" });
  await dbojs.create({
    id: PLAYER_ID,
    flags: "player connected",
    data: { name: "Chatter", channels: [{ channel: "public", alias: "pub", active: true }] },
    location: ROOM_ID
  });

  const ctx = makeCtx(PLAYER_ID, "pub Hello world");
  const result = await matchChannel(ctx);
  assertEquals(result, true);

  await cleanup(PLAYER_ID);
  await chans.delete({ id: CHAN_ID }).catch(() => {});
});

Deno.test("matchChannel — inactive channel returns false", OPTS, async () => {
  await chans.create({ id: CHAN_ID, name: "public", header: "[PUB]", lock: "" });
  await dbojs.create({
    id: PLAYER_ID,
    flags: "player connected",
    data: { name: "Chatter", channels: [{ channel: "public", alias: "pub", active: false }] }, // inactive!
    location: ROOM_ID
  });

  const ctx = makeCtx(PLAYER_ID, "pub Hello");
  const result = await matchChannel(ctx);
  assertEquals(result, false);

  await cleanup(PLAYER_ID);
  await chans.delete({ id: CHAN_ID }).catch(() => {});
});

// ===========================================================================
// Cleanup
// ===========================================================================
Deno.test("cleanup — close DB", OPTS, async () => {
  await cleanup(ROOM_ID, ROOM2_ID, PLAYER_ID, EXIT_ID);
  await chans.delete({ id: CHAN_ID }).catch(() => {});
  await DBO.close();
});
