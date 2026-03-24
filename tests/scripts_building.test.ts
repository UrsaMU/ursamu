/**
 * tests/scripts_building.test.ts
 *
 * Sandbox-driven tests for engine-owned building scripts:
 *   - system/scripts/create.ts   (@create)
 *
 * NOTE: @dig, @describe, @open, @clone, @wipe, @quota, @parent, @lock,
 * @unlink, @name, @set, &ATTR, @examine were moved to builder-plugin.
 * Tests for those commands live in the builder-plugin repo.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

const RAW_CREATE = await Deno.readTextFile("./system/scripts/create.ts");

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

const SLOW = { timeout: 10000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ACTOR_ID = "sb_bld_admin";
const ROOM_ID  = "sb_bld_room";

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

  assertEquals(Array.isArray(result), true, "result should be an array");
  assertStringIncludes(result.join(" "), "You create TestBox");
  const dbrefMatch = result.join(" ").match(/#(\w+)/);
  assertEquals(dbrefMatch !== null, true, "confirmation message should contain a dbref");

  const newThingId = dbrefMatch![1];
  const created = await dbojs.queryOne({ id: newThingId });
  assertEquals(!!created, true, "created object should be findable in the DB");
  if (created) assertEquals(created.data?.name, "TestBox");

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
  await DBO.close();
});
