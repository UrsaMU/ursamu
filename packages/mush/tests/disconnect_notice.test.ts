import { assertEquals } from "@std/assert";
import {
  notifyRoomConnect,
  notifyRoomDisconnect,
} from "../src/events/disconnect-notice.ts";
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
    await notifyRoomDisconnect(player);
  },
);

Deno.test(
  "notifyRoomConnect: no-op when player has no location",
  OPTS,
  async () => {
    const player = {
      id: "p1",
      flags: "player connected",
      data: { name: "Alice" },
    } as IDBOBJ;
    await notifyRoomConnect(player);
  },
);

Deno.test(
  "notifyRoomDisconnect: playerLabel prefers moniker",
  OPTS,
  async () => {
    const player = {
      id: "p2",
      flags: "player",
      data: { name: "Bob", moniker: "Bobby" },
    } as IDBOBJ;
    await notifyRoomDisconnect(player);
    assertEquals(player.data?.moniker, "Bobby");
  },
);

Deno.test(
  "notifyRoomConnect: playerLabel prefers moniker",
  OPTS,
  async () => {
    const player = {
      id: "p3",
      flags: "player connected",
      data: { name: "Carol", moniker: "Cee" },
    } as IDBOBJ;
    await notifyRoomConnect(player);
    assertEquals(player.data?.moniker, "Cee");
  },
);
