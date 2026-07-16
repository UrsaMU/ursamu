import { assertEquals, assert } from "@std/assert";
import { DBO } from "@ursamu/core";
import { chans, gameHooks } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("channels: seeds default channels on engine:ready", OPTS, async () => {
  // Clean up any existing channels in test DB
  const all = await chans.query({});
  for (const c of all) {
    await chans.delete({ id: c.id });
  }

  // Load the plugin to ensure its listeners are registered
  const { channelsPlugin } = await import("../packages/channels/mod.ts");
  channelsPlugin.init();

  // Emit engine:ready
  await gameHooks.emit("engine:ready");

  // Check if Public and Admin channels are created
  const publicChan = await chans.queryOne({ id: "public" });
  const adminChan = await chans.queryOne({ id: "admin" });

  assert(publicChan, "Public channel was not seeded");
  assertEquals(publicChan.name, "Public");
  assertEquals(publicChan.alias, "pub");
  assertEquals(publicChan.lock, "connected");

  assert(adminChan, "Admin channel was not seeded");
  assertEquals(adminChan.name, "Admin");
  assertEquals(adminChan.alias, "ad");
  assertEquals(adminChan.lock, "connected admin+");

  // Clean up
  await chans.delete({ id: "public" });
  await chans.delete({ id: "admin" });
});

Deno.test("channels_seeding cleanup", OPTS, async () => {
  await DBO.close();
});
