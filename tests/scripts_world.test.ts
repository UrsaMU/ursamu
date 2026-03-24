/**
 * tests/scripts_world.test.ts
 *
 * Tests for engine-owned world-manipulation scripts:
 *   - system/scripts/teleport.ts  (@teleport)
 *   - system/scripts/search.ts    (@search / @stats)
 *
 * NOTE: @link and @unlink were moved to builder-plugin.
 * Tests for those commands live in the builder-plugin repo.
 */
import { assertStringIncludes } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";
import { DBO } from "../src/services/Database/database.ts";

const RAW_TELEPORT = await Deno.readTextFile("./system/scripts/teleport.ts");
const RAW_SEARCH   = await Deno.readTextFile("./system/scripts/search.ts");

function wrapScript(raw: string, extra = ""): string {
  const stripped = raw
    .replace(/^import\s.*?;\s*$/gm, "")
    .replace(/export const aliases.*?;/gs, "")
    .replace(/export default/, "_main =")
    .replace(/^export\s+/gm, "");
  return [
    "let _main;",
    stripped,
    "const _sent = [];",
    "u.send = (m) => _sent.push(m);",
    extra,
    "await _main(u);",
    "return _sent;",
  ].join("\n");
}

const SLOW = { timeout: 10000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };
const ROOM_ID  = "sw_room1";
const ACTOR_ID = "sw_actor1";

const jsRoom  = `{ id: "sw_room1",  name: "Start Room",  flags: new Set(["room"]),        state: { name: "Start Room"  }, contents: [] }`;
const jsRoom2 = `{ id: "sw_room2",  name: "End Room",    flags: new Set(["room"]),        state: { name: "End Room"    }, contents: [] }`;
const jsExit  = `{ id: "sw_exit1",  name: "North Exit",  flags: new Set(["exit"]),        state: { name: "North"       }, contents: [] }`;
const jsThing = `{ id: "sw_thing1", name: "Magic Orb",   flags: new Set(["thing"]),       state: { name: "Magic Orb"   }, contents: [] }`;
const jsLocked= `{ id: "sw_lr1",    name: "Locked Room", flags: new Set(["room"]),        state: { name: "Locked Room" }, contents: [] }`;

const baseStubs = `
  u.util = { ...u.util, displayName: (o) => o.name || o.id };
  u.canEdit = () => true;
  u.teleport = () => {};
`;

function makeCtx(id: string, flags: string, name: string, cmd: string, args: string[]): SDKContext {
  return {
    id,
    state: { name },
    me: { id, name, flags: new Set(flags.split(" ")), state: { name } },
    here: { id: ROOM_ID, name: "Test Room", flags: new Set(["room"]), state: {} },
    cmd: { name: cmd, original: cmd, args, switches: [] },
    socketId: `sock-${id}`,
  };
}

// ===========================================================================
// teleport.ts
// ===========================================================================

Deno.test("@teleport — no = sends usage", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Actor", "@teleport", ["Alice"]);
  const result = await sandboxService.runScript(wrapScript(RAW_TELEPORT), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Usage");
});

Deno.test("@teleport — target not found", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Actor", "@teleport", ["Ghost=Room2"]);
  const extra = baseStubs + `u.db = { ...u.db, search: async () => [] };`;
  const result = await sandboxService.runScript(wrapScript(RAW_TELEPORT, extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Could not find target");
});

Deno.test("@teleport — destination not found", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "admin connected", "Admin", "@teleport", ["Magic Orb=Nowhere"]);
  const extra = baseStubs + `
    let _c = 0;
    u.db = { ...u.db, search: async () => ++_c === 1 ? [${jsThing}] : [] };
  `;
  const result = await sandboxService.runScript(wrapScript(RAW_TELEPORT, extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Could not find destination");
});

Deno.test("@teleport — permission denied on target", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Player", "@teleport", ["Magic Orb=End Room"]);
  const extra = `
    u.util = { ...u.util, displayName: (o) => o.name || o.id };
    u.canEdit = () => false;
    u.teleport = () => {};
    let _c = 0;
    u.db = { ...u.db, search: async () => ++_c === 1 ? [${jsThing}] : [${jsRoom2}] };
  `;
  const result = await sandboxService.runScript(wrapScript(RAW_TELEPORT, extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Permission denied");
});

Deno.test("@teleport — permission denied on non-enter_ok destination", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "admin connected", "Admin", "@teleport", ["Magic Orb=Locked Room"]);
  const extra = `
    u.util = { ...u.util, displayName: (o) => o.name || o.id };
    u.canEdit = (a, t) => t.id !== "sw_lr1";
    u.teleport = () => {};
    let _c = 0;
    u.db = { ...u.db, search: async () => ++_c === 1 ? [${jsThing}] : [${jsLocked}] };
  `;
  const result = await sandboxService.runScript(wrapScript(RAW_TELEPORT, extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Permission denied");
});

Deno.test("@teleport — success sends confirmation", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "admin connected", "Admin", "@teleport", ["Magic Orb=End Room"]);
  const extra = baseStubs + `
    let _c = 0;
    u.db = { ...u.db, search: async () => ++_c === 1 ? [${jsThing}] : [${jsRoom2}] };
  `;
  const result = await sandboxService.runScript(wrapScript(RAW_TELEPORT, extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "teleport");
  assertStringIncludes(result.join(" "), "Magic Orb");
  assertStringIncludes(result.join(" "), "End Room");
});

// ===========================================================================
// search.ts
// ===========================================================================

Deno.test("@search — name search returns match", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Player", "@search", ["Magic Orb"]);
  const extra = baseStubs + `u.db = { ...u.db, search: async () => [${jsThing}] };`;
  const result = await sandboxService.runScript(wrapScript(RAW_SEARCH, extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Magic Orb");
});

Deno.test("@search — no results", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Player", "@search", ["Nonexistent"]);
  const extra = baseStubs + `u.db = { ...u.db, search: async () => [] };`;
  const result = await sandboxService.runScript(wrapScript(RAW_SEARCH, extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "No matches found");
});

Deno.test("@search — name=val form", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Player", "@search", ["name=Orb"]);
  const extra = baseStubs + `u.db = { ...u.db, search: async () => [${jsThing}] };`;
  const result = await sandboxService.runScript(wrapScript(RAW_SEARCH, extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Magic Orb");
});

Deno.test("@search — flag=val form", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Player", "@search", ["flag=room"]);
  const extra = baseStubs + `u.db = { ...u.db, search: async () => [${jsRoom}] };`;
  const result = await sandboxService.runScript(wrapScript(RAW_SEARCH, extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Start Room");
});

Deno.test("@search — invalid param sends error", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Player", "@search", ["color=blue"]);
  const extra = baseStubs + `u.db = { ...u.db, search: async () => [] };`;
  const result = await sandboxService.runScript(wrapScript(RAW_SEARCH, extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Invalid search parameter");
});

Deno.test("@stats — shows total object counts", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Player", "@stats", []);
  ctx.cmd.original = "@stats";
  const extra = baseStubs + `
    u.db = { ...u.db, search: async () => [
      ${jsRoom}, ${jsRoom2}, ${jsExit}, ${jsThing},
      { id: "sw_p1", name: "Player1", flags: new Set(["player"]), state: {}, contents: [] }
    ]};
  `;
  const result = await sandboxService.runScript(wrapScript(RAW_SEARCH, extra), ctx, SLOW) as string[];
  const out = result.join(" ");
  assertStringIncludes(out, "Total Objects");
  assertStringIncludes(out, "5");
  assertStringIncludes(out, "Rooms: 2");
  assertStringIncludes(out, "Players: 1");
});

Deno.test("cleanup — close DB", OPTS, async () => {
  await DBO.close();
});
