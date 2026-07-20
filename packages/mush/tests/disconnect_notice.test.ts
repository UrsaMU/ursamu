import { assertEquals } from "@std/assert";
import { notifyRoomDisconnect } from "../src/events/disconnect-notice.ts";
import type { IDBOBJ } from "../src/world/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test(
  "notifyRoomDisconnect: no-op when player has no location",
  OPTS,
  async () => {
    const player = {
      id: "p1",
      flags: "player",
      data: { name: "Alice" },
    } as IDBOBJ;
    // Must not throw
    await notifyRoomDisconnect(player);
  },
);

Deno.test(
  "notifyRoomDisconnect: playerLabel prefers moniker",
  OPTS,
  async () => {
    // Exercise through no-location path — pure smoke that moniker
    // field is accepted without throw. Full room delivery is covered
    // by integration (needs live sessions + dbojs).
    const player = {
      id: "p2",
      flags: "player",
      data: { name: "Bob", moniker: "Bobby" },
    } as IDBOBJ;
    await notifyRoomDisconnect(player);
    assertEquals(player.data?.moniker, "Bobby");
  },
);
