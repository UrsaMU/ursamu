/**
 * moveObject: leave/arrive + location update.
 */
import { assertEquals } from "@std/assert";
import { dbojs } from "../src/world/dbobjs.ts";
import { moveObject } from "../src/world/move.ts";
import type { IDBOBJ } from "../src/world/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const R1 = "mv_room1";
const R2 = "mv_room2";
const P = "mv_player";

async function wipe(): Promise<void> {
  for (const id of [R1, R2, P]) {
    const prior = await dbojs.queryOne({ id });
    if (prior) await dbojs.delete({ id });
  }
}

Deno.test("moveObject: updates location", OPTS, async () => {
  await wipe();
  await dbojs.create({
    id: R1,
    flags: "room",
    data: { name: "Start" },
  });
  await dbojs.create({
    id: R2,
    flags: "room",
    data: { name: "End" },
  });
  await dbojs.create({
    id: P,
    flags: "player connected",
    location: R1,
    data: { name: "Mover" },
  });

  const ok = await moveObject({
    targetId: P,
    destinationId: R2,
    look: false,
    quiet: true,
  });
  assertEquals(ok, true);
  const p = await dbojs.queryOne({ id: P }) as IDBOBJ;
  assertEquals(p.location, R2);
  await wipe();
});

Deno.test("moveObject: missing dest fails", OPTS, async () => {
  await wipe();
  await dbojs.create({
    id: P,
    flags: "player",
    location: R1,
    data: { name: "Mover" },
  });
  const ok = await moveObject({
    targetId: P,
    destinationId: "no_such_room",
    look: false,
  });
  assertEquals(ok, false);
  await wipe();
});
