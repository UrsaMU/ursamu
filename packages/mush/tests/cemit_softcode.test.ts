/**
 * Softcode cemit delivers via rooms.broadcast (channel name).
 */
import { assertEquals } from "@std/assert";
import { rooms } from "@ursamu/core";
import { dbojs, chans } from "../src/world/dbobjs.ts";
import { runSoftcodeSimple } from "../src/softcode/engine.ts";
import { deliverCemit } from "../src/softcode/cemit.ts";
import "../src/softcode/stdlib/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test(
  "deliverCemit: rooms.broadcast to channel",
  OPTS,
  async () => {
    const sid = "cemit_sock_1";
    rooms.join(sid, "Public");
    assertEquals(rooms.members("Public").includes(sid), true);
    await deliverCemit("Public", "hello channel");
    rooms.leave(sid, "Public");
  },
);

Deno.test(
  "softcode cemit does not throw for known channel",
  OPTS,
  async () => {
    const prior = await chans.queryOne({ id: "public" });
    if (!prior) {
      await chans.create({
        id: "public",
        name: "Public",
        header: "[Public]",
      } as Record<string, unknown> & { id: string; name: string });
    }
    const a = await dbojs.queryOne({ id: "cemit_actor" });
    if (a) await dbojs.delete({ id: "cemit_actor" });
    await dbojs.create({
      id: "cemit_actor",
      flags: "player connected",
      data: { name: "CemitActor" },
    });

    const out = await runSoftcodeSimple(
      "[cemit(Public,test line)]",
      { actorId: "cemit_actor", executorId: "cemit_actor" },
    );
    assertEquals(out, "");

    await dbojs.delete({ id: "cemit_actor" });
  },
);
