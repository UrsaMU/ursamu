/**
 * tests/security_joinchans.test.ts
 *
 * #9 — joinChans writes the full player object back with $set instead of
 *       only updating data.channels. An unrelated field set before joinChans
 *       runs must survive untouched after the call.
 */
import { assertEquals } from "@std/assert";
import { dbojs, chans, DBO } from "../src/services/Database/database.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("#9 — joinChans must not clobber unrelated player fields", OPTS, async () => {
  const playerId = "jc_player9";
  const chanName = "jc_public";

  // Create a channel the player should auto-join
  await chans.create({ id: chanName, name: chanName, alias: "+jcp", lock: "", hidden: false, owner: "1", header: "[JCP]" });

  // Player with a sentinel field that must survive
  await dbojs.create({
    id: playerId,
    flags: "player connected",
    location: "1",
    data: { name: "JCPlayer", sentinel: "must-survive", channels: [] },
  });

  // Build a minimal IContext/socket stub
  const mockSocket = {
    id: "sock_jc9",
    cid: playerId,
    rooms: new Set<string>(),
    join: (r: string) => mockSocket.rooms.add(r),
    leave: (r: string) => mockSocket.rooms.delete(r),
    send: () => {},
    disconnect: () => {},
  };
  const ctx = { socket: mockSocket as unknown as Parameters<typeof joinChans>[0]["socket"], msg: "" };

  const { joinChans } = await import("../src/utils/joinChans.ts");
  await joinChans(ctx);

  // sentinel field must still be present
  const after = await dbojs.queryOne({ id: playerId });
  assertEquals((after?.data as Record<string, unknown>)?.sentinel, "must-survive");

  // cleanup
  await dbojs.delete({ id: playerId }).catch(() => {});
  await chans.delete({ id: chanName }).catch(() => {});
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
Deno.test("security_joinchans cleanup", OPTS, async () => {
  await DBO.close();
});
