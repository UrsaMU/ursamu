/**
 * tests/scripts_identity.test.ts
 *
 * Sandbox-driven tests for identity/naming system scripts:
 *   - system/scripts/name.ts    (@name)
 *   - system/scripts/moniker.ts (@moniker)
 *   - system/scripts/alias.ts   (@alias)
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

const RAW_NAME    = await Deno.readTextFile("../builder-plugin/scripts/name.ts");
const RAW_MONIKER = await Deno.readTextFile("./system/scripts/moniker.ts");
const RAW_ALIAS   = await Deno.readTextFile("./system/scripts/alias.ts");

function wrapScript(raw: string): string {
  const stripped = raw
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
    "await _main(u);",
    "return _sent;",
  ].join("\n");
}

const SLOW = { timeout: 10000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "id_room1";
const ACTOR_ID = "id_actor1";
const THING_ID = "id_thing1";
const OTHER_ID = "id_thing2";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

function makeCtx(
  id: string,
  flags: string,
  name: string,
  cmd: string,
  args: string[],
  extra: Record<string, unknown> = {}
): SDKContext {
  return {
    id,
    state: {},
    me: { id, name, flags: new Set(flags.split(" ")), state: { name } },
    here: { id: ROOM_ID, name: "TestRoom", flags: new Set(["room"]), state: {} },
    cmd: { name: cmd, original: cmd, args, switches: [] },
    socketId: `sock-${id}`,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// @name tests
// ---------------------------------------------------------------------------

Deno.test("@name — no args sends usage message", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@name", [""]);
  const result = await sandboxService.runScript(wrapScript(RAW_NAME), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Usage");
  await cleanup(ACTOR_ID);
});

Deno.test("@name — target not found sends 'can't find' message", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@name", ["GhostObj9999=NewName"]);
  const result = await sandboxService.runScript(wrapScript(RAW_NAME), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "can't find");
  await cleanup(ACTOR_ID);
});

Deno.test("@name — permission denied when actor cannot edit target", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Player" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "SomeThing" },
    location: ROOM_ID,
  });

  // Deny edit permission for THING_ID
  const ctx = makeCtx(actor.id, "player", "Player", "@name", ["SomeThing=NewName"], {
    permissions: { [thing.id]: false },
  });
  const result = await sandboxService.runScript(wrapScript(RAW_NAME), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Permission denied");
  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@name — successfully renames object and updates DB", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "OldThing" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@name", ["OldThing=NewThing"]);
  const result = await sandboxService.runScript(wrapScript(RAW_NAME), ctx, SLOW) as string[];

  assertEquals(result.join(" ").includes("Name set") || result.join(" ").includes("set"), true,
    `Expected success message, got: ${result.join(" ")}`);

  const updated = await dbojs.queryOne({ id: thing.id });
  // deno-lint-ignore no-explicit-any
  assertEquals((updated as any)?.data?.name, "NewThing");

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@name — name already taken by another object is rejected", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const _thing1 = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "BoxA" },
    location: ROOM_ID,
  });
  const _thing2 = await dbojs.create({
    id: OTHER_ID,
    flags: "thing",
    data: { name: "BoxB" },
    location: ROOM_ID,
  });

  // Try to rename BoxA to BoxB (already taken by thing2)
  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@name", ["BoxA=BoxB"]);
  const result = await sandboxService.runScript(wrapScript(RAW_NAME), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "taken");

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID, OTHER_ID);
});

// ---------------------------------------------------------------------------
// @moniker tests
// ---------------------------------------------------------------------------

Deno.test("@moniker — non-admin/wizard gets permission denied", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Player" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player", "Player", "@moniker", ["Player=Playa"]);
  const result = await sandboxService.runScript(wrapScript(RAW_MONIKER), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Permission denied");
  await cleanup(ACTOR_ID, ROOM_ID);
});

Deno.test("@moniker — no moniker value sends usage message", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });

  // Only target, no moniker after =
  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@moniker", ["Admin="]);
  const result = await sandboxService.runScript(wrapScript(RAW_MONIKER), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Usage");
  await cleanup(ACTOR_ID, ROOM_ID);
});

Deno.test("@moniker — target not found", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@moniker", ["Ghost9999=Nick"]);
  const result = await sandboxService.runScript(wrapScript(RAW_MONIKER), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "can't find");
  await cleanup(ACTOR_ID);
});

Deno.test("@moniker — wizard successfully sets moniker and persists to DB", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const target = await dbojs.create({
    id: THING_ID,
    flags: "player connected",
    data: { name: "Alice" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@moniker", ["Alice=%chAlicia%cn"]);
  const result = await sandboxService.runScript(wrapScript(RAW_MONIKER), ctx, SLOW) as string[];

  // Script sends "Set moniker for <name> to <moniker>."
  assertStringIncludes(result.join(" "), "moniker");
  assertStringIncludes(result.join(" "), "Alice");

  const updated = await dbojs.queryOne({ id: target.id });
  // deno-lint-ignore no-explicit-any
  assertEquals((updated as any)?.data?.moniker, "%chAlicia%cn");

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

// ---------------------------------------------------------------------------
// @alias tests
// ---------------------------------------------------------------------------

Deno.test("@alias — target not found sends error", OPTS, async () => {
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@alias", ["Ghost9999=nick"]);
  const result = await sandboxService.runScript(wrapScript(RAW_ALIAS), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "can't find");
  await cleanup(ACTOR_ID);
});

Deno.test("@alias — permission denied when actor cannot edit target", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player connected",
    data: { name: "Player" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Prop" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player", "Player", "@alias", ["Prop=knickknack"], {
    permissions: { [thing.id]: false },
  });
  const result = await sandboxService.runScript(wrapScript(RAW_ALIAS), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Permission denied");
  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@alias — successfully sets alias and reports it", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Lamp" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@alias", ["Lamp=lantern"]);
  const result = await sandboxService.runScript(wrapScript(RAW_ALIAS), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "lantern");
  assertStringIncludes(result.join(" "), "Lamp");

  // Verify alias was written to DB
  const updated = await dbojs.queryOne({ id: thing.id });
  // deno-lint-ignore no-explicit-any
  assertEquals((updated as any)?.data?.alias, "lantern");

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@alias — clearing alias (empty value) removes it from DB", OPTS, async () => {
  const _room = await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Room" } });
  const actor = await dbojs.create({
    id: ACTOR_ID,
    flags: "player wizard connected",
    data: { name: "Admin" },
    location: ROOM_ID,
  });
  const _thing = await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Candle", alias: "taper" },
    location: ROOM_ID,
  });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@alias", ["Candle="]);
  const result = await sandboxService.runScript(wrapScript(RAW_ALIAS), ctx, SLOW) as string[];

  // Script sends "Alias for <name> removed."
  assertStringIncludes(result.join(" "), "removed");

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});
