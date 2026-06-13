// H1 exploit + regression. The respawn cooldown gate must be claimed inside
// a CAS so two concurrent invocations cannot both pass it and double-spawn.
//
// We can't test the full tickZone spawn pipeline easily because dbojs.query
// in production returns raw IDBOBJ shape that diverges from the in-test
// MockObjectStore; instead this test directly exercises runRespawnPass's
// race semantics via the exported helper claimRespawn (added with the fix).

import { assert, assertEquals } from "@std/assert";
import {
  claimRespawn,
  destroyZone,
  findZoneByName,
  setRespawnCooldown,
  stopAllWanderers,
  zoneDb,
} from "../src/combat/zone.ts";
import { mockU } from "./helpers/mockU.ts";
import { zoneExec } from "../src/commands/zone.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

async function cleanupZone(name: string): Promise<void> {
  const z = await findZoneByName(name);
  if (z) await destroyZone(z.id);
  stopAllWanderers();
}

Deno.test("claimRespawn lets exactly one of two concurrent claims win", OPTS, async () => {
  await cleanupZone("claim-test");
  const create = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "claim-test"],
  });
  await zoneExec(create);
  const z = await findZoneByName("claim-test");
  assert(z);
  await setRespawnCooldown(z.id, 30_000);
  // Force lastRespawnAt back to 0 so the cooldown window is open.
  await zoneDb.atomicModify(z.id, (cur) => ({ ...cur, lastRespawnAt: 0 }));

  // Two concurrent claims; exactly one should win.
  const [a, b] = await Promise.all([claimRespawn(z.id), claimRespawn(z.id)]);
  const wins = (a ? 1 : 0) + (b ? 1 : 0);
  assertEquals(wins, 1, `expected exactly one winner, got a=${a} b=${b}`);

  // A third immediate claim should also lose (cooldown not elapsed).
  const c = await claimRespawn(z.id);
  assertEquals(c, false, "third claim should lose -- cooldown not elapsed");

  await cleanupZone("claim-test");
});

Deno.test("claimRespawn returns false when respawn is off", OPTS, async () => {
  await cleanupZone("claim-off");
  const create = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "claim-off"],
  });
  await zoneExec(create);
  const z = await findZoneByName("claim-off");
  assert(z);
  const won = await claimRespawn(z.id);
  assertEquals(won, false, "must not claim when cooldown is unset");
  await cleanupZone("claim-off");
});
