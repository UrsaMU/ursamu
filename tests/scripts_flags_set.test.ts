/**
 * tests/scripts_flags_set.test.ts
 *
 * Tests for:
 *   - system/scripts/flags.ts  (@flags — set/remove flags on objects)
 *   - system/scripts/set.ts    (@set — set/clear attributes on objects)
 *   - system/scripts/doing.ts  (@doing — set player status message)
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

// ---------------------------------------------------------------------------
// Raw scripts
// ---------------------------------------------------------------------------

const RAW_FLAGS = await Deno.readTextFile("./system/scripts/flags.ts");
const RAW_SET   = await Deno.readTextFile("../builder-plugin/scripts/set.ts");
const RAW_DOING = await Deno.readTextFile("./system/scripts/doing.ts");

// ---------------------------------------------------------------------------
// Helpers
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
    // Stub ui.layout so it doesn't resolve the sandbox early
    "u.ui = { ...u.ui, layout: () => {}, panel: (o) => o };",
    extra,
    "await _main(u);",
    "return _sent;",
  ].join("\n");
}

const SLOW = { timeout: 10000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ACTOR_ID = "fsq_actor";
const ROOM_ID  = "fsq_room";
const THING_ID = "fsq_thing";

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
    here: { id: ROOM_ID, name: "Test Room", flags: new Set(["room"]), state: {} },
    cmd: { name: cmd, original: cmd, args, switches: [] },
    socketId: `sock-${id}`,
  };
}

// ---------------------------------------------------------------------------
// @flags tests
// ---------------------------------------------------------------------------

Deno.test("@flags — missing = sends usage message", OPTS, async () => {
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player wizard connected", data: { name: "Admin" }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@flags", ["noequalshere"]);
  const result = await sandboxService.runScript(wrapScript(RAW_FLAGS), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Usage");
  await cleanup(ACTOR_ID);
});

Deno.test("@flags — empty flags after = sends usage message", OPTS, async () => {
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player wizard connected", data: { name: "Admin" }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@flags", ["sometarget="]);
  const result = await sandboxService.runScript(wrapScript(RAW_FLAGS), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Usage");
  await cleanup(ACTOR_ID);
});

Deno.test("@flags — target not found sends error", OPTS, async () => {
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player wizard connected", data: { name: "Admin" }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@flags", ["GhostThing99=builder"]);
  const result = await sandboxService.runScript(wrapScript(RAW_FLAGS), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "can't find");
  await cleanup(ACTOR_ID);
});

Deno.test("@flags — wizard sets flag on object", OPTS, async () => {
  await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Test Room" } });
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player wizard connected", data: { name: "Admin" }, location: ROOM_ID });
  await dbojs.create({ id: THING_ID, flags: "thing", data: { name: "TargetBox" }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@flags", ["TargetBox=safe"]);
  const result = await sandboxService.runScript(wrapScript(RAW_FLAGS), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Flags set on");
  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

// ---------------------------------------------------------------------------
// @set tests
// ---------------------------------------------------------------------------

Deno.test("@set — missing / syntax sends usage message", OPTS, async () => {
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player wizard connected", data: { name: "Admin" }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@set", ["badformat"]);
  const result = await sandboxService.runScript(wrapScript(RAW_SET), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Usage");
  await cleanup(ACTOR_ID);
});

Deno.test("@set — sets attribute on object and persists to DB", OPTS, async () => {
  await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Test Room" } });
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player wizard connected", data: { name: "Admin" }, location: ROOM_ID });
  await dbojs.create({ id: THING_ID, flags: "thing", data: { name: "SetBox" }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@set", ["SetBox/COLOR=blue"]);
  const result = await sandboxService.runScript(wrapScript(RAW_SET), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "COLOR");

  // Verify it was persisted
  const updated = await dbojs.queryOne({ id: THING_ID }) as Record<string, unknown>;
  assertEquals((updated?.data as Record<string, unknown>)?.COLOR, "blue");

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@set — clears attribute when value is empty and persists to DB", OPTS, async () => {
  await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Test Room" } });
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player wizard connected", data: { name: "Admin" }, location: ROOM_ID });
  await dbojs.create({ id: THING_ID, flags: "thing", data: { name: "SetBox", COLOR: "red" }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@set", ["SetBox/COLOR="], { COLOR: "red" });
  const result = await sandboxService.runScript(wrapScript(RAW_SET), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "cleared");

  // Verify it was removed from DB
  const updated = await dbojs.queryOne({ id: THING_ID }) as Record<string, unknown>;
  assertEquals((updated?.data as Record<string, unknown>)?.COLOR, undefined);

  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@set — rejects system property deletion", OPTS, async () => {
  await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Test Room" } });
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player wizard connected", data: { name: "Admin" }, location: ROOM_ID });
  await dbojs.create({ id: THING_ID, flags: "thing", data: { name: "SetBox" }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@set", ["SetBox/name="]);
  const result = await sandboxService.runScript(wrapScript(RAW_SET), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Cannot delete");
  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

Deno.test("@set — rejects value over 4096 chars", OPTS, async () => {
  await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Test Room" } });
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player wizard connected", data: { name: "Admin" }, location: ROOM_ID });
  await dbojs.create({ id: THING_ID, flags: "thing", data: { name: "SetBox" }, location: ROOM_ID });

  const big = "x".repeat(4097);
  const ctx = makeCtx(actor.id, "player wizard", "Admin", "@set", [`SetBox/NOTE=${big}`]);
  const result = await sandboxService.runScript(wrapScript(RAW_SET), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "too long");
  await cleanup(ACTOR_ID, ROOM_ID, THING_ID);
});

// ---------------------------------------------------------------------------
// @doing tests
// ---------------------------------------------------------------------------

Deno.test("@doing — sets status message and persists to DB", OPTS, async () => {
  await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Test Room" } });
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Player" }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player connected", "Player", "@doing", ["Writing code"]);
  const result = await sandboxService.runScript(wrapScript(RAW_DOING), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "Writing code");

  const updated = await dbojs.queryOne({ id: ACTOR_ID }) as Record<string, unknown>;
  assertEquals((updated?.data as Record<string, unknown>)?.doing, "Writing code");

  await cleanup(ACTOR_ID, ROOM_ID);
});

Deno.test("@doing — clears status when given no args and persists to DB", OPTS, async () => {
  await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Test Room" } });
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Player", doing: "Old status" }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player connected", "Player", "@doing", [""], { doing: "Old status" });
  const result = await sandboxService.runScript(wrapScript(RAW_DOING), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "cleared");

  const updated = await dbojs.queryOne({ id: ACTOR_ID }) as Record<string, unknown>;
  assertEquals((updated?.data as Record<string, unknown>)?.doing, undefined);

  await cleanup(ACTOR_ID, ROOM_ID);
});

Deno.test("@doing — rejects message over 100 chars", OPTS, async () => {
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Player" }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player connected", "Player", "@doing", ["x".repeat(101)]);
  const result = await sandboxService.runScript(wrapScript(RAW_DOING), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "too long");
  await cleanup(ACTOR_ID);
});

// ---------------------------------------------------------------------------
// Quota persistence tests
// ---------------------------------------------------------------------------

Deno.test("@create — quota is decremented and persisted to DB", OPTS, async () => {
  const RAW_CREATE = await Deno.readTextFile("./system/scripts/create.ts");
  await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Test Room" } });
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Player", quota: 5 }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player connected", "Player", "@create", ["Widget"], { quota: 5 });
  const result = await sandboxService.runScript(wrapScript(RAW_CREATE), ctx, SLOW) as string[];

  assertStringIncludes(result.join(" "), "You create Widget");

  const updated = await dbojs.queryOne({ id: ACTOR_ID }) as Record<string, unknown>;
  assertEquals((updated?.data as Record<string, unknown>)?.quota, 4);

  const newId = result.join(" ").match(/#(\w+)/)?.[1];
  await cleanup(ACTOR_ID, ROOM_ID, ...(newId ? [newId] : []));
});

Deno.test("@dig — quota is decremented and persisted to DB", OPTS, async () => {
  const RAW_DIG = await Deno.readTextFile("../builder-plugin/scripts/dig.ts");
  await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Test Room" } });
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Player", quota: 5 }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player connected", "Player", "@dig", ["NewCave"], { quota: 5 });
  const result = await sandboxService.runScript(wrapScript(RAW_DIG), ctx, SLOW) as string[];

  const plain = result.map((s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntbR]/g, "")).join(" ");
  assertStringIncludes(plain, "Room NewCave created");

  const updated = await dbojs.queryOne({ id: ACTOR_ID }) as Record<string, unknown>;
  assertEquals((updated?.data as Record<string, unknown>)?.quota, 4);

  const newId = plain.match(/#(\w+)/)?.[1];
  await cleanup(ACTOR_ID, ROOM_ID, ...(newId ? [newId] : []));
});

Deno.test("@dig — superuser bypasses quota check", OPTS, async () => {
  const RAW_DIG = await Deno.readTextFile("../builder-plugin/scripts/dig.ts");
  await dbojs.create({ id: ROOM_ID, flags: "room", data: { name: "Test Room" } });
  const actor = await dbojs.create({ id: ACTOR_ID, flags: "player superuser connected", data: { name: "Super", quota: 0 }, location: ROOM_ID });

  const ctx = makeCtx(actor.id, "player superuser", "Super", "@dig", ["SuperCave"], { quota: 0 });
  const result = await sandboxService.runScript(wrapScript(RAW_DIG), ctx, SLOW) as string[];

  const plain = result.map((s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntbR]/g, "")).join(" ");
  assertStringIncludes(plain, "Room SuperCave created");

  const newId = plain.match(/#(\w+)/)?.[1];
  await cleanup(ACTOR_ID, ROOM_ID, ...(newId ? [newId] : []));
  await DBO.close();
});
