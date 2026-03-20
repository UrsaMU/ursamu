/**
 * tests/scripts_building.test.ts
 *
 * Sandbox-driven tests for the building/creation system scripts:
 *   - system/scripts/create.ts   (@create)
 *   - system/scripts/dig.ts      (@dig)
 *   - system/scripts/describe.ts (@describe)
 *
 * All tests follow the wrapScript pattern from admin.test.ts.
 * DB fixtures are prefixed "sb_bld_" to avoid collisions with other test files.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

// ---------------------------------------------------------------------------
// Raw script text
// ---------------------------------------------------------------------------

const RAW_CREATE   = await Deno.readTextFile("./system/scripts/create.ts");
const RAW_DIG      = await Deno.readTextFile("./system/scripts/dig.ts");
const RAW_DESCRIBE = await Deno.readTextFile("./system/scripts/describe.ts");
const RAW_OPEN     = await Deno.readTextFile("./system/scripts/open.ts");

// ---------------------------------------------------------------------------
// Script wrapper
// Strips ESM import/export declarations so the script runs as legacy block
// code inside a `new Function` body (top-level `return` is valid there).
// ---------------------------------------------------------------------------

function wrapScript(rawScript: string, extra = ""): string {
  const stripped = rawScript
    .replace(/^import\s.*?;\s*$/gm, "")
    .replace(/export const aliases.*?;/gs, "")
    .replace(/export default/, "_main =")
    .replace(/^export\s+/gm, "");
  return [
    "let _main;",
    stripped,
    "const _sent = [];",
    "const _origSend = u.send.bind(u);",
    "u.send = (m, t, o) => { _sent.push(m); _origSend(m, t, o); };",
    extra,
    "await _main(u);",
    "return _sent;",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLOW = { timeout: 10000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ACTOR_ID = "sb_bld_admin";
const ROOM_ID  = "sb_bld_room";
const THING_ID = "sb_bld_thing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

function makeCtx(
  id: string,
  flags: string,
  name: string,
  cmd: string,
  args: string[],
  state: Record<string, unknown> = {}
): SDKContext {
  return {
    id,
    state,
    me: { id, name, flags: new Set(flags.split(" ")), state },
    here: { id: ROOM_ID, name: "Build Room", flags: new Set(["room"]), state: {} },
    cmd: { name: cmd, original: cmd, args, switches: [] },
    socketId: `sock-${id}`,
  };
}

// ---------------------------------------------------------------------------
// @create tests
// ---------------------------------------------------------------------------

Deno.test("@create — no args sends usage message", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "BuildAdmin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "BuildAdmin", "@create", [""]);
  const result = await sandboxService.runScript(wrapScript(RAW_CREATE), ctx, SLOW) as string[];

  assertEquals(Array.isArray(result), true);
  assertStringIncludes(result.join(" "), "Usage");

  await cleanup(ACTOR_ID);
});

Deno.test("@create — wizard creates object, DB entry is stored", OPTS, async () => {
  const _room  = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Build Room" } });
  const actor  = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "BuildAdmin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "BuildAdmin", "@create", ["TestBox"]);
  const result = await sandboxService.runScript(wrapScript(RAW_CREATE), ctx, SLOW) as string[];

  // Confirm the script reported success
  assertEquals(Array.isArray(result), true, "result should be an array");
  assertStringIncludes(result.join(" "), "You create TestBox");
  // Confirm a dbref was included
  const dbrefMatch = result.join(" ").match(/#(\w+)/);
  assertEquals(dbrefMatch !== null, true, "confirmation message should contain a dbref like (#<id>)");

  // Confirm the DB object was actually created (location = actor id, wizard bypasses quota)
  const newThingId = dbrefMatch![1];
  const created = await dbojs.queryOne({ id: newThingId });
  assertEquals(!!created, true, "created object should be findable in the DB");
  if (created) {
    assertEquals(created.data?.name, "TestBox");
  }

  await cleanup(ACTOR_ID, ROOM_ID, newThingId);
});

Deno.test("@create — non-wizard with quota=0 gets quota error", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "NormalPlayer" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player connected", "NormalPlayer", "@create", ["CheapThing"], { quota: 0 });
  const result = await sandboxService.runScript(wrapScript(RAW_CREATE), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "quota");

  await cleanup(ACTOR_ID);
});

Deno.test("@create — non-wizard with sufficient quota creates object", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Build Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "NormalPlayer" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player connected", "NormalPlayer", "@create", ["QuotaThing"], { quota: 5 });
  const result = await sandboxService.runScript(wrapScript(RAW_CREATE), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "You create QuotaThing");

  // Find and clean up the created object
  const dbrefMatch = result.join(" ").match(/#(\w+)/);
  const newId = dbrefMatch ? dbrefMatch[1] : null;
  await cleanup(ACTOR_ID, ROOM_ID, ...(newId ? [newId] : []));
});

Deno.test("@create — name with cost suffix (name=cost) is accepted", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Build Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "BuildAdmin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "BuildAdmin", "@create", ["PriceyBox=10"]);
  const result = await sandboxService.runScript(wrapScript(RAW_CREATE), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "You create PriceyBox");

  const dbrefMatch = result.join(" ").match(/#(\w+)/);
  const newId = dbrefMatch ? dbrefMatch[1] : null;
  await cleanup(ACTOR_ID, ROOM_ID, ...(newId ? [newId] : []));
});

// ---------------------------------------------------------------------------
// @dig tests
// ---------------------------------------------------------------------------

Deno.test("@dig — no/bad args sends usage message", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "BuildAdmin" },
    location: ROOM_ID,
  });

  // @dig without a proper pattern fails the regex
  const ctx = makeCtx(actor.id, "player wizard", "BuildAdmin", "@dig", [""]);
  const result = await sandboxService.runScript(wrapScript(RAW_DIG), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Usage");

  await cleanup(ACTOR_ID);
});

Deno.test("@dig — wizard digs a room only", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Build Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "BuildAdmin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "BuildAdmin", "@dig", ["NewCave"]);
  const result = await sandboxService.runScript(wrapScript(RAW_DIG), ctx, SLOW) as string[];

  assertEquals(Array.isArray(result), true);
  // @dig sends exactly one message: "Room <name> created with dbref ..."
  assertEquals(result.length, 1, "Should send exactly one message for room-only dig");
  assertStringIncludes(result[0], "Room NewCave created with dbref");

  // Verify DB
  const dbrefMatch = result[0].match(/#(\w+)/);
  const newRoomId = dbrefMatch ? dbrefMatch[1] : null;
  if (newRoomId) {
    const created = await dbojs.queryOne({ id: newRoomId });
    assertEquals(!!created, true);
    if (created) assertEquals(created.data?.name, "NewCave");
    await cleanup(newRoomId);
  }

  await cleanup(ACTOR_ID, ROOM_ID);
});

Deno.test("@dig — room + to-exit produces two messages", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Build Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "BuildAdmin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "BuildAdmin", "@dig", ["EastCave=East;e"]);
  const result = await sandboxService.runScript(wrapScript(RAW_DIG), ctx, SLOW) as string[];

  assertEquals(result.length, 2, "Should send room message + one exit message");
  assertStringIncludes(result[0], "Room EastCave created");
  assertStringIncludes(result[1], "Exit East created");

  // Clean up created objects
  const ids = result
    .map((m: string) => m.match(/#(\w+)/))
    .filter(Boolean)
    .map((m: RegExpMatchArray | null) => m![1]);
  await cleanup(ACTOR_ID, ROOM_ID, ...ids);
});

Deno.test("@dig — room + both exits produces three messages", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Build Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "BuildAdmin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "BuildAdmin", "@dig", ["WestCave=West;w,East;e"]);
  const result = await sandboxService.runScript(wrapScript(RAW_DIG), ctx, SLOW) as string[];

  assertEquals(result.length, 3, "Should send room message + two exit messages");
  assertStringIncludes(result[0], "Room WestCave created");
  // One of the remaining messages is for "West" exit and one for "East" exit
  const exitMessages = result.slice(1).join(" ");
  assertStringIncludes(exitMessages, "Exit West created");
  assertStringIncludes(exitMessages, "Exit East created");

  const ids = result
    .map((m: string) => m.match(/#(\w+)/))
    .filter(Boolean)
    .map((m: RegExpMatchArray | null) => m![1]);
  await cleanup(ACTOR_ID, ROOM_ID, ...ids);
});

Deno.test("@dig — non-wizard with quota=0 gets quota error", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "NormalPlayer" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player connected", "NormalPlayer", "@dig", ["FailCave"], { quota: 0 });
  const result = await sandboxService.runScript(wrapScript(RAW_DIG), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "quota");

  await cleanup(ACTOR_ID);
});

Deno.test("@dig — non-wizard with sufficient quota digs successfully", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Build Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "NormalPlayer" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player connected", "NormalPlayer", "@dig", ["QuotaCave"], { quota: 5 });
  const result = await sandboxService.runScript(wrapScript(RAW_DIG), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Room QuotaCave created");

  const ids = result
    .map((m: string) => m.match(/#(\w+)/))
    .filter(Boolean)
    .map((m: RegExpMatchArray | null) => m![1]);
  await cleanup(ACTOR_ID, ROOM_ID, ...ids);
});

// ---------------------------------------------------------------------------
// @describe tests
// ---------------------------------------------------------------------------

Deno.test("@describe — no args sends usage message", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "BuildAdmin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "BuildAdmin", "@describe", [""]);
  const result = await sandboxService.runScript(wrapScript(RAW_DESCRIBE), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Usage");

  await cleanup(ACTOR_ID);
});

Deno.test("@describe — target=<name only, no desc> sends usage message", OPTS, async () => {
  // Supplying only a name with no '=' hits the match[3] branch which sends Usage
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "BuildAdmin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "BuildAdmin", "@describe", ["someTarget"]);
  const result = await sandboxService.runScript(wrapScript(RAW_DESCRIBE), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Usage");

  await cleanup(ACTOR_ID);
});

Deno.test("@describe — target not found sends 'can't find' message", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "BuildAdmin" },
    location: ROOM_ID,
  });

  // The db:search handler will call target() which returns undefined for "GhostObject99999"
  const ctx = makeCtx(actor.id, "player wizard", "BuildAdmin", "@describe", ["GhostObject99999=A nice description"]);
  const result = await sandboxService.runScript(wrapScript(RAW_DESCRIBE), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "can't find");

  await cleanup(ACTOR_ID);
});

Deno.test("@describe — describes an existing object and persists to DB", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Build Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "BuildAdmin" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "DescribableBox" },
    location: ROOM_ID,
  });

  // db:search uses target() with global=true, so it finds by name in the whole DB
  const ctx = makeCtx(actor.id, "player wizard", "BuildAdmin", "@describe", ["DescribableBox=A nice test room"]);
  const result = await sandboxService.runScript(wrapScript(RAW_DESCRIBE), ctx, SLOW) as string[];

  // Script should send "Set."
  assertEquals(Array.isArray(result), true);
  assertStringIncludes(result.join(" "), "Set.");

  // Verify the description was actually written to the DB
  const updated = await dbojs.queryOne({ id: thing.id });
  assertEquals(!!updated, true, "Thing should still exist in DB after describe");
  if (updated) {
    assertEquals(
      (updated.data as Record<string, unknown>)?.description,
      "A nice test room",
      "DB description field should match what was set"
    );
  }

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@describe — description over 4096 chars sends 'Description too long'", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Build Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "BuildAdmin" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "BigBox" },
    location: ROOM_ID,
  });

  const longDesc = "x".repeat(4097);
  const ctx = makeCtx(actor.id, "player wizard", "BuildAdmin", "@describe", [`BigBox=${longDesc}`]);
  const result = await sandboxService.runScript(wrapScript(RAW_DESCRIBE), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Description too long");

  // DB should NOT have been updated
  const unchanged = await dbojs.queryOne({ id: thing.id });
  if (unchanged) {
    assertEquals(
      (unchanged.data as Record<string, unknown>)?.description,
      undefined,
      "DB description should NOT be set when description is too long"
    );
  }

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@describe — can describe 'here' (the actor's current room)", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Build Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "BuildAdmin" },
    location: ROOM_ID,
  });

  // "here" resolves to actor's location via db:search → target("here")
  const ctx = makeCtx(actor.id, "player wizard", "BuildAdmin", "@describe", ["here=A plain stone chamber."]);
  const result = await sandboxService.runScript(wrapScript(RAW_DESCRIBE), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Set.");

  const updatedRoom = await dbojs.queryOne({ id: ROOM_ID });
  if (updatedRoom) {
    assertEquals(
      (updatedRoom.data as Record<string, unknown>)?.description,
      "A plain stone chamber.",
      "Room description should be stored in DB"
    );
  }

  await cleanup(ACTOR_ID, ROOM_ID);
});

// ---------------------------------------------------------------------------
// @open tests
// ---------------------------------------------------------------------------

Deno.test("@open — missing authorization vulnerability on back exits (RED phase)", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "NormalPlayer" },
    location: ROOM_ID,
  });

  const destRoom = await dbojs.create({
    id: "sb_dest_room",
    flags: "room",
    data: { name: "Admin_Only_Room", owner: "admin_id" },
  });

  const ctx = makeCtx(actor.id, "player connected", "NormalPlayer", "@open", ["MyExit=#sb_dest_room,BackExit"], { quota: 5 });
  // Mock permissions to deny building in destRoom
  ctx.permissions = { ["sb_dest_room"]: false };

  const result = await sandboxService.runScript(wrapScript(RAW_OPEN), ctx, SLOW) as string[];

  const msgs = result.join(" ");
  // If the vulnerability exists, the script will create the back exit and not deny permission.
  assertStringIncludes(msgs, "Permission denied");

  await cleanup(ACTOR_ID, destRoom.id);
});

// Close the DB after all tests
Deno.test("cleanup — close DB", OPTS, async () => {
  await DBO.close();
});
