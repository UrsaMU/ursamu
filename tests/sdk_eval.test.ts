/**
 * tests/sdk_eval.test.ts
 *
 * Tests for u.eval(target, attr, args) — evaluates an attribute as a script
 * and returns the result string.
 */
import { assertEquals } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const SLOW = { timeout: 15000 };

const ROOM_ID  = "ue_room1";
const ACTOR_ID = "ue_actor1";
const OBJ_ID   = "ue_obj1";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

// ---------------------------------------------------------------------------
// u.eval — basic attribute evaluation
// ---------------------------------------------------------------------------

Deno.test("u.eval — evaluates attribute returning string with args", OPTS, async () => {
  const _room = await dbojs.create({
    id: ROOM_ID,
    flags: "room",
    data: { name: "TestRoom" },
  });

  const _actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Tester" },
    location: ROOM_ID,
  });

  const obj = await dbojs.create({
    id: OBJ_ID,
    flags: "thing",
    data: {
      name: "Widget",
      attributes: [
        {
          name: "GREET",
          value: `return "Hello, " + u.cmd.args[0];`,
          setter: ACTOR_ID,
          type: "attribute",
        },
      ],
    },
    location: ROOM_ID,
  });

  // Run a script that calls u.eval and returns the result
  const script = `
    u.ui = { ...u.ui, layout: () => {}, panel: (o) => o };
    const result = await u.eval("${obj.id}", "GREET", ["World"]);
    return result;
  `;

  const ctx: SDKContext = {
    id: ACTOR_ID,
    state: {},
    me: { id: ACTOR_ID, name: "Tester", flags: new Set(["player", "connected"]), state: { name: "Tester" }, location: ROOM_ID },
    here: { id: ROOM_ID, name: "TestRoom", flags: new Set(["room"]), state: {} },
    cmd: { name: "test", args: [] },
    socketId: "sock-ue1",
  };

  const result = await sandboxService.runScript(script, ctx, SLOW);
  assertEquals(result, "Hello, World");

  await cleanup(ROOM_ID, ACTOR_ID, OBJ_ID);
});

// ---------------------------------------------------------------------------
// u.eval — non-existent attribute returns empty string
// ---------------------------------------------------------------------------

Deno.test("u.eval — non-existent attribute returns empty string", OPTS, async () => {
  const obj = await dbojs.create({
    id: OBJ_ID,
    flags: "thing",
    data: { name: "Gadget", attributes: [] },
    location: ROOM_ID,
  });

  const script = `
    u.ui = { ...u.ui, layout: () => {}, panel: (o) => o };
    const result = await u.eval("${obj.id}", "NOSUCHATTR", []);
    return result;
  `;

  const ctx: SDKContext = {
    id: ACTOR_ID,
    state: {},
    me: { id: ACTOR_ID, name: "Tester", flags: new Set(["player"]), state: {} },
    here: { id: ROOM_ID, name: "TestRoom", flags: new Set(["room"]), state: {} },
    cmd: { name: "test", args: [] },
    socketId: "sock-ue2",
  };

  const result = await sandboxService.runScript(script, ctx, SLOW);
  assertEquals(result, "");

  await cleanup(OBJ_ID);
});

// ---------------------------------------------------------------------------
// u.eval — non-existent object returns empty string
// ---------------------------------------------------------------------------

Deno.test("u.eval — non-existent object returns empty string", OPTS, async () => {
  const script = `
    u.ui = { ...u.ui, layout: () => {}, panel: (o) => o };
    const result = await u.eval("ue_nonexistent_9999", "GREET", ["World"]);
    return result;
  `;

  const ctx: SDKContext = {
    id: ACTOR_ID,
    state: {},
    me: { id: ACTOR_ID, name: "Tester", flags: new Set(["player"]), state: {} },
    here: { id: ROOM_ID, name: "TestRoom", flags: new Set(["room"]), state: {} },
    cmd: { name: "test", args: [] },
    socketId: "sock-ue3",
  };

  const result = await sandboxService.runScript(script, ctx, SLOW);
  assertEquals(result, "");

  await DBO.close();
});
