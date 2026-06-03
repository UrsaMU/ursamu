/**
 * Sandbox-side u.util.resolveFormat — closes issue #132.
 *
 * Drives the worker bridge end-to-end: seed a target with a softcode attribute,
 * invoke `u.util.resolveFormat(target, slot, defaultArg)` from inside a sandbox
 * script via sandboxService.runScript, and assert the rendered softcode result.
 */
import { assertEquals } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const SLOW = { timeout: 20000 };

const ROOM_ID  = "rf_room1";
const ACTOR_ID = "rf_actor1";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

Deno.test("sandbox: u.util.resolveFormat returns softcode-evaluated attr value", { ...OPTS, ...SLOW }, async () => {
  await dbojs.create({
    id: ROOM_ID,
    flags: "room",
    data: {
      name: "RFRoom",
      attributes: [
        { name: "NAMEFORMAT", value: "<<%0>>", setter: ACTOR_ID, type: "attribute" },
      ],
    },
  });
  await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Tester" },
    location: ROOM_ID,
  });

  const script = `
    u.ui = { ...u.ui, layout: () => {}, panel: (o) => o };
    const room = { id: "${ROOM_ID}", flags: new Set(["room"]), state: {}, contents: [] };
    const result = await u.util.resolveFormat(room, "NAMEFORMAT", "default-name");
    return result;
  `;

  const ctx: SDKContext = {
    id: ACTOR_ID,
    state: {},
    me: { id: ACTOR_ID, name: "Tester", flags: new Set(["player", "connected"]), state: { name: "Tester" }, location: ROOM_ID },
    here: { id: ROOM_ID, name: "RFRoom", flags: new Set(["room"]), state: {} },
    cmd: { name: "test", args: [] },
    socketId: "sock-rf-1",
  };

  const result = await sandboxService.runScript(script, ctx, SLOW);
  assertEquals(result, "<<default-name>>");

  await cleanup(ROOM_ID, ACTOR_ID);
});

Deno.test("sandbox: u.util.resolveFormat returns null when no attr + no handler", { ...OPTS, ...SLOW }, async () => {
  await dbojs.create({
    id: ROOM_ID,
    flags: "room",
    data: { name: "BareRoom", attributes: [] },
  });
  await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Tester" },
    location: ROOM_ID,
  });

  const script = `
    u.ui = { ...u.ui, layout: () => {}, panel: (o) => o };
    const room = { id: "${ROOM_ID}", flags: new Set(["room"]), state: {}, contents: [] };
    const result = await u.util.resolveFormat(room, "NAMEFORMAT", "default");
    return result === null ? "NULL" : result;
  `;

  const ctx: SDKContext = {
    id: ACTOR_ID,
    state: {},
    me: { id: ACTOR_ID, name: "Tester", flags: new Set(["player", "connected"]), state: {}, location: ROOM_ID },
    here: { id: ROOM_ID, name: "BareRoom", flags: new Set(["room"]), state: {} },
    cmd: { name: "test", args: [] },
    socketId: "sock-rf-2",
  };

  const result = await sandboxService.runScript(script, ctx, SLOW);
  assertEquals(result, "NULL");

  await cleanup(ROOM_ID, ACTOR_ID);
});

Deno.test("sandbox: u.util.resolveFormatOr returns fallback when null", { ...OPTS, ...SLOW }, async () => {
  await dbojs.create({
    id: ROOM_ID,
    flags: "room",
    data: { name: "BareRoom", attributes: [] },
  });
  await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Tester" },
    location: ROOM_ID,
  });

  const script = `
    u.ui = { ...u.ui, layout: () => {}, panel: (o) => o };
    const room = { id: "${ROOM_ID}", flags: new Set(["room"]), state: {}, contents: [] };
    return await u.util.resolveFormatOr(room, "NAMEFORMAT", "default", "FALLBACK_USED");
  `;

  const ctx: SDKContext = {
    id: ACTOR_ID,
    state: {},
    me: { id: ACTOR_ID, name: "Tester", flags: new Set(["player", "connected"]), state: {}, location: ROOM_ID },
    here: { id: ROOM_ID, name: "BareRoom", flags: new Set(["room"]), state: {} },
    cmd: { name: "test", args: [] },
    socketId: "sock-rf-3",
  };

  const result = await sandboxService.runScript(script, ctx, SLOW);
  assertEquals(result, "FALLBACK_USED");

  await cleanup(ROOM_ID, ACTOR_ID);
});

Deno.test("sandbox: u.util.resolveFormat hydrates target contents for handlers", { ...OPTS, ...SLOW }, async () => {
  const { registerFormatHandler, _clearFormatHandlers } = await import(
    "../src/utils/formatHandlers.ts"
  );

  const ITEM_ID = "rf_item1";
  await dbojs.create({
    id: ROOM_ID,
    flags: "room",
    data: { name: "RoomWithContents", attributes: [] },
  });
  await dbojs.create({
    id: ITEM_ID,
    flags: "thing",
    data: { name: "A red rose" },
    location: ROOM_ID,
  });
  await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Tester" },
    location: ROOM_ID,
  });

  registerFormatHandler("TEST_HYDRATION", (_u, target, _arg) => {
    const contents = target.contents || [];
    return contents.map((c) => c.name).join(",");
  });

  const script = `
    u.ui = { ...u.ui, layout: () => {}, panel: (o) => o };
    const room = { id: "${ROOM_ID}", flags: new Set(["room"]), state: {}, contents: [] };
    return await u.util.resolveFormat(room, "TEST_HYDRATION", "");
  `;

  const ctx: SDKContext = {
    id: ACTOR_ID,
    state: {},
    me: { id: ACTOR_ID, name: "Tester", flags: new Set(["player", "connected"]), state: {}, location: ROOM_ID },
    here: { id: ROOM_ID, name: "RoomWithContents", flags: new Set(["room"]), state: {} },
    cmd: { name: "test", args: [] },
    socketId: "sock-rf-4",
  };

  try {
    const result = await sandboxService.runScript(script, ctx, SLOW);
    const items = String(result).split(",");
    assertEquals(items.includes("A red rose"), true);
    assertEquals(items.includes("Tester"), true);
  } finally {
    _clearFormatHandlers();
    await cleanup(ROOM_ID, ACTOR_ID, ITEM_ID);
    await DBO.close();
  }
});

