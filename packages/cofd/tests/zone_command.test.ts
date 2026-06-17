// Behaviour tests for +zone. Exercises permission gates, parsing, and
// end-to-end zone create -> populate -> wander persistence through the
// real DBO (Deno KV opened by the test runner via --unstable-kv).

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { mockU } from "./helpers/mockU.ts";
import { zoneExec } from "../src/commands/zone.ts";
import {
  destroyZone,
  findZoneByName,
  stopAllWanderers,
  tickZone,
} from "../src/combat/zone.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

async function cleanup(name: string): Promise<void> {
  const z = await findZoneByName(name);
  if (z) await destroyZone(z.id);
  stopAllWanderers();
}

Deno.test("non-staff cannot enumerate zones via /list", OPTS, async () => {
  await cleanup("hidden-zone");
  const setup = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "hidden-zone"],
  });
  await zoneExec(setup);

  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["list", ""],
  });
  await zoneExec(u);
  const out = u._sent.join("\n");
  // Should be a permission denial, not a list of staff-staged zones.
  assertStringIncludes(out, "Permission denied");
  assert(!out.includes("hidden-zone"), "zone name leaked to non-staff");

  await cleanup("hidden-zone");
});

Deno.test("non-staff cannot inspect a zone via /show", OPTS, async () => {
  await cleanup("hidden-zone");
  const setup = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "hidden-zone"],
  });
  await zoneExec(setup);

  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["show", "hidden-zone"],
  });
  await zoneExec(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Permission denied");

  await cleanup("hidden-zone");
});

Deno.test("non-staff is rejected from /create", OPTS, async () => {
  await cleanup("test-alley");
  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["create", "test-alley"],
  });
  await zoneExec(u);
  assertStringIncludes(u._sent.join("\n"), "Permission denied");
  assertEquals(await findZoneByName("test-alley"), null);
});

Deno.test("staff /create persists a zone anchored to the current room", OPTS, async () => {
  await cleanup("test-alley");
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "test-alley"],
  });
  await zoneExec(u);
  assertStringIncludes(u._sent.join("\n"), "Created zone");
  const z = await findZoneByName("test-alley");
  assert(z, "zone not persisted");
  assertEquals(z.roomIds, ["2"]);
  assertEquals(z.wanderEnabled, false);
  await cleanup("test-alley");
});

Deno.test("/populate rejects bad syntax and unknown archetypes", OPTS, async () => {
  await cleanup("test-alley");
  const setup = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "test-alley"],
  });
  await zoneExec(setup);

  const u1 = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["populate", "test-alley"],
  });
  await zoneExec(u1);
  assertStringIncludes(u1._sent.join("\n"), "Syntax: +zone/populate");

  const u2 = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["populate", "test-alley=nosuchx2"],
  });
  await zoneExec(u2);
  assertStringIncludes(u2._sent.join("\n"), "Unknown archetype");

  await cleanup("test-alley");
});

Deno.test("/wander toggles flag and reports state", OPTS, async () => {
  await cleanup("test-alley");
  const setup = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "test-alley"],
  });
  await zoneExec(setup);

  const on = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["wander", "test-alley=on"],
  });
  await zoneExec(on);
  assertStringIncludes(on._sent.join("\n"), "Wander started");

  const z = await findZoneByName("test-alley");
  assert(z);
  assertEquals(z.wanderEnabled, true);

  const off = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["wander", "test-alley=off"],
  });
  await zoneExec(off);
  assertStringIncludes(off._sent.join("\n"), "Wander stopped");

  await cleanup("test-alley");
});

Deno.test("/destroy removes the zone and stops the interval", OPTS, async () => {
  await cleanup("test-alley");
  const setup = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "test-alley"],
  });
  await zoneExec(setup);

  const destroy = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["destroy", "test-alley"],
  });
  await zoneExec(destroy);
  assertStringIncludes(destroy._sent.join("\n"), "destroyed");
  assertEquals(await findZoneByName("test-alley"), null);
});

Deno.test("tickZone is a no-op after destroyZone (race protection)", OPTS, async () => {
  await cleanup("race-test");
  const setup = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "race-test"],
  });
  await zoneExec(setup);
  const z = await findZoneByName("race-test");
  assert(z);

  await destroyZone(z.id);
  // Should not throw and should not touch any objects.
  await tickZone(z.id);
  assertEquals(await findZoneByName("race-test"), null);
});

Deno.test("/theme accepts valid theme and rejects invalid", OPTS, async () => {
  await cleanup("themed-zone");
  const setup = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "themed-zone"],
  });
  await zoneExec(setup);

  const set = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["theme", "themed-zone=forest"],
  });
  await zoneExec(set);
  assertStringIncludes(set._sent.join("\n"), "Theme set to 'forest'");

  const bad = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["theme", "themed-zone=galaxy"],
  });
  await zoneExec(bad);
  assertStringIncludes(bad._sent.join("\n"), "Unknown theme");

  const clear = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["theme", "themed-zone=none"],
  });
  await zoneExec(clear);
  assertStringIncludes(clear._sent.join("\n"), "Theme cleared");

  await cleanup("themed-zone");
});

Deno.test("/respawn sets and clears cooldown; rejects bad values", OPTS, async () => {
  await cleanup("respawn-zone");
  const setup = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "respawn-zone"],
  });
  await zoneExec(setup);

  const set = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["respawn", "respawn-zone=120"],
  });
  await zoneExec(set);
  assertStringIncludes(set._sent.join("\n"), "Respawn cooldown set to 120s");
  let z = await findZoneByName("respawn-zone");
  assert(z);
  assertEquals(z.respawnCooldownMs, 120_000);

  const bad = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["respawn", "respawn-zone=999999"],
  });
  await zoneExec(bad);
  assertStringIncludes(bad._sent.join("\n"), "Cooldown must be");

  const off = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["respawn", "respawn-zone=off"],
  });
  await zoneExec(off);
  assertStringIncludes(off._sent.join("\n"), "Respawn disabled");
  z = await findZoneByName("respawn-zone");
  assert(z);
  assertEquals(z.respawnCooldownMs, undefined);

  await cleanup("respawn-zone");
});

Deno.test("/flavor non-staff is rejected", OPTS, async () => {
  await cleanup("flavor-zone");
  const setup = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "flavor-zone"],
  });
  await zoneExec(setup);

  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["flavor", "flavor-zone=off"],
  });
  await zoneExec(u);
  assertStringIncludes(u._sent.join("\n"), "Permission denied");

  await cleanup("flavor-zone");
});

Deno.test("/migration toggles allowMigration flag", OPTS, async () => {
  await cleanup("migrate-zone");
  const setup = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "migrate-zone"],
  });
  await zoneExec(setup);

  const on = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["migration", "migrate-zone=on"],
  });
  await zoneExec(on);
  assertStringIncludes(on._sent.join("\n"), "Migration enabled");
  let z = await findZoneByName("migrate-zone");
  assert(z);
  assertEquals(z.allowMigration, true);

  const off = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["migration", "migrate-zone=off"],
  });
  await zoneExec(off);
  assertStringIncludes(off._sent.join("\n"), "Migration disabled");
  z = await findZoneByName("migrate-zone");
  assert(z);
  assertEquals(z.allowMigration, false);

  await cleanup("migrate-zone");
});

Deno.test("/migration rejects non-staff", OPTS, async () => {
  await cleanup("migrate-zone");
  const setup = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "migrate-zone"],
  });
  await zoneExec(setup);

  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["migration", "migrate-zone=on"],
  });
  await zoneExec(u);
  assertStringIncludes(u._sent.join("\n"), "Permission denied");
  await cleanup("migrate-zone");
});
