/**
 * tests/scripts_admin_tools.test.ts
 *
 * Tests for admin power-tool system scripts:
 *   - tel.ts        (@tel  — admin teleport)
 *   - forceCmd.ts   (@force — run command as another object)
 *   - sweep.ts      (@sweep — list reactive objects in room)
 *   - entrances.ts  (@entrances — list exits pointing to a location)
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

const RAW_TEL       = await Deno.readTextFile("./system/scripts/tel.ts");
const RAW_FORCE     = await Deno.readTextFile("./system/scripts/forceCmd.ts");
const RAW_SWEEP     = await Deno.readTextFile("./system/scripts/sweep.ts");
const RAW_ENTRANCES = await Deno.readTextFile("./system/scripts/entrances.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    "u.send = (m, t) => _sent.push({ msg: m, target: t });",
    extra,
    "await _main(u);",
    "return _sent;",
  ].join("\n");
}

type SentMsg = { msg: string; target?: string };

const SLOW = { timeout: 10_000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID   = "at_room1";
const ACTOR_ID  = "at_actor1";
const TARGET_ID = "at_target1";
const DEST_ID   = "at_dest1";
const EXIT_ID   = "at_exit1";
const NPC_ID    = "at_npc1";

function makeCtx(
  actorFlags: string,
  cmd: string,
  args: string[],
  actorId = ACTOR_ID
): SDKContext {
  return {
    id: actorId,
    state: { name: "Admin" },
    me: {
      id: actorId,
      name: "Admin",
      flags: new Set(actorFlags.split(" ")),
      state: {},
    },
    here: { id: ROOM_ID, name: "Test Room", flags: new Set(["room"]), state: {} },
    cmd: { name: cmd, original: cmd, args, switches: [] },
    socketId: `sock-${actorId}`,
  };
}

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

// ---------------------------------------------------------------------------
// @tel tests
// ---------------------------------------------------------------------------

Deno.test("@tel — non-admin rejected with Permission denied", OPTS, async () => {
  const ctx = makeCtx("player connected", "@tel", ["SomeOne=SomePlace"]);
  const result = await sandboxService.runScript(wrapScript(RAW_TEL), ctx, SLOW) as SentMsg[];
  assertStringIncludes(result.map(r => r.msg).join(" "), "Permission denied");
});

Deno.test("@tel — no = sends usage", OPTS, async () => {
  const ctx = makeCtx("admin wizard", "@tel", ["NoEquals"]);
  const result = await sandboxService.runScript(wrapScript(RAW_TEL), ctx, SLOW) as SentMsg[];
  assertStringIncludes(result.map(r => r.msg).join(" "), "Usage");
});

Deno.test("@tel — target not found", OPTS, async () => {
  const ctx = makeCtx("admin", "@tel", ["Ghost=SomeRoom"]);
  const extra = `
    u.util = { ...u.util, target: async () => undefined };
  `;
  const result = await sandboxService.runScript(wrapScript(RAW_TEL, extra), ctx, SLOW) as SentMsg[];
  assertStringIncludes(result.map(r => r.msg).join(" "), "can't find");
});

Deno.test("@tel — admin moves player, db.modify called with new location", OPTS, async () => {
  const ctx = makeCtx("admin", "@tel", [`${TARGET_ID}=${DEST_ID}`]);

  const wrapped = (() => {
    const stripped = RAW_TEL
      .replace(/^import\s.*?;\s*$/gm, "")
      .replace(/export const aliases.*?;/gs, "")
      .replace(/export default/, "_main =")
      .replace(/^export\s+/gm, "");
    return [
      "let _main;",
      stripped,
      "const _sent = [];",
      "u.send = (m, t) => _sent.push({ msg: m, target: t });",
      `const _modifyCalls = [];`,
      `let _callCount = 0;`,
      `u.util = { ...u.util, target: async (_a, _n) => {`,
      `  _callCount++;`,
      `  if (_callCount === 1) return { id: "${TARGET_ID}", name: "Victim", flags: new Set(["player"]), state: {}, contents: [] };`,
      `  return { id: "${DEST_ID}", name: "Hall", flags: new Set(["room"]), state: {}, contents: [] };`,
      `}};`,
      `u.db = { ...u.db, modify: async (id, op, data) => { _modifyCalls.push([id, op, data]); } };`,
      "await _main(u);",
      "return { sent: _sent, modifyCalls: _modifyCalls };",
    ].join("\n");
  })();

  const result = await sandboxService.runScript(wrapped, ctx, SLOW) as {
    sent: SentMsg[];
    modifyCalls: Array<[string, string, unknown]>;
  };

  // Should have called modify with the correct location
  assertEquals(result.modifyCalls.length, 1);
  assertEquals(result.modifyCalls[0][0], TARGET_ID);
  assertEquals(result.modifyCalls[0][1], "$set");

  // Should have notified target and admin
  const allMsgs = result.sent.map(r => r.msg).join(" ");
  assertStringIncludes(allMsgs, "teleport");
});

// ---------------------------------------------------------------------------
// @force tests
// ---------------------------------------------------------------------------

Deno.test("@force — non-admin rejected", OPTS, async () => {
  const ctx = makeCtx("player connected", "@force", ["Target=say hello"]);
  const result = await sandboxService.runScript(wrapScript(RAW_FORCE), ctx, SLOW) as SentMsg[];
  assertStringIncludes(result.map(r => r.msg).join(" "), "Permission denied");
});

Deno.test("@force — no = sends usage", OPTS, async () => {
  const ctx = makeCtx("admin", "@force", ["NoEqualsHere"]);
  const result = await sandboxService.runScript(wrapScript(RAW_FORCE), ctx, SLOW) as SentMsg[];
  assertStringIncludes(result.map(r => r.msg).join(" "), "Usage");
});

Deno.test("@force — target not found sends I can't find", OPTS, async () => {
  const ctx = makeCtx("wizard", "@force", ["Ghost=say hi"]);
  const extra = `u.util = { ...u.util, target: async () => undefined };`;
  const result = await sandboxService.runScript(wrapScript(RAW_FORCE, extra), ctx, SLOW) as SentMsg[];
  assertStringIncludes(result.map(r => r.msg).join(" "), "can't find");
});

Deno.test("@force — cannot force superuser as non-superuser", OPTS, async () => {
  const ctx = makeCtx("admin wizard", "@force", [`${TARGET_ID}=say hello`]);
  const extra = `
    u.util = { ...u.util, target: async () => ({ id: "${TARGET_ID}", name: "God", flags: new Set(["superuser"]), state: {}, contents: [] }) };
  `;
  const result = await sandboxService.runScript(wrapScript(RAW_FORCE, extra), ctx, SLOW) as SentMsg[];
  assertStringIncludes(result.map(r => r.msg).join(" "), "superuser");
});

Deno.test("@force — admin forces command, forceAs called and actor notified", OPTS, async () => {
  const ctx = makeCtx("admin", "@force", [`${TARGET_ID}=say hello`]);

  const wrapped = (() => {
    const stripped = RAW_FORCE
      .replace(/^import\s.*?;\s*$/gm, "")
      .replace(/export const aliases.*?;/gs, "")
      .replace(/export default/, "_main =")
      .replace(/^export\s+/gm, "");
    return [
      "let _main;",
      stripped,
      "const _sent = [];",
      "u.send = (m, t) => _sent.push({ msg: m, target: t });",
      `const _forceCalls = [];`,
      `u.util = { ...u.util, target: async () => ({ id: "${TARGET_ID}", name: "Minion", flags: new Set(["player"]), state: {}, contents: [] }) };`,
      `u.forceAs = async (tId, cmd) => { _forceCalls.push({ tId, cmd }); };`,
      "await _main(u);",
      "return { sent: _sent, forceCalls: _forceCalls };",
    ].join("\n");
  })();

  const result = await sandboxService.runScript(wrapped, ctx, SLOW) as {
    sent: SentMsg[];
    forceCalls: Array<{ tId: string; cmd: string }>;
  };

  assertEquals(result.forceCalls.length, 1);
  assertEquals(result.forceCalls[0].tId, TARGET_ID);
  assertEquals(result.forceCalls[0].cmd, "say hello");
  assertStringIncludes(result.sent.map(r => r.msg).join(" "), "force");
});

// ---------------------------------------------------------------------------
// @sweep tests
// ---------------------------------------------------------------------------

Deno.test("@sweep — empty room returns 'No reactive objects'", OPTS, async () => {
  const ctx = makeCtx("player connected", "@sweep", []);
  const extra = `u.db = { ...u.db, search: async () => [] };`;
  const result = await sandboxService.runScript(wrapScript(RAW_SWEEP, extra), ctx, SLOW) as SentMsg[];
  assertStringIncludes(result.map(r => r.msg).join(" "), "No reactive");
});

Deno.test("@sweep — room with LISTEN object lists it", OPTS, async () => {
  const ctx = makeCtx("player connected", "@sweep", []);

  const npcObj = `{
    id: "${NPC_ID}",
    name: "Guard",
    flags: new Set(["thing"]),
    location: "${ROOM_ID}",
    state: {
      attributes: [
        { name: "LISTEN", value: "hello", setter: "god", type: "attribute" },
        { name: "AHEAR",  value: "u.send('ok')", setter: "god", type: "attribute" }
      ]
    },
    contents: []
  }`;
  const extra = `u.db = { ...u.db, search: async () => [${npcObj}] };`;
  const result = await sandboxService.runScript(wrapScript(RAW_SWEEP, extra), ctx, SLOW) as SentMsg[];
  const allMsgs = result.map(r => r.msg).join("\n");
  assertStringIncludes(allMsgs, "Guard");
  assertStringIncludes(allMsgs, "LISTEN");
});

Deno.test("@sweep — actor itself is skipped even if it has reactive attrs", OPTS, async () => {
  const ctx = makeCtx("player connected", "@sweep", []);

  // Return the actor itself with a LISTEN attr — should be skipped
  const actorObj = `{
    id: "${ACTOR_ID}",
    name: "Admin",
    flags: new Set(["player"]),
    location: "${ROOM_ID}",
    state: { attributes: [{ name: "LISTEN", value: "*", setter: "god", type: "attribute" }] },
    contents: []
  }`;
  const extra = `u.db = { ...u.db, search: async () => [${actorObj}] };`;
  const result = await sandboxService.runScript(wrapScript(RAW_SWEEP, extra), ctx, SLOW) as SentMsg[];
  assertStringIncludes(result.map(r => r.msg).join(" "), "No reactive");
});

Deno.test("@sweep — multiple reactive attrs shown together", OPTS, async () => {
  const ctx = makeCtx("wizard", "@sweep", []);

  const npcObj = `{
    id: "${NPC_ID}",
    name: "AutoBot",
    flags: new Set(["thing"]),
    location: "${ROOM_ID}",
    state: {
      attributes: [
        { name: "ACONNECT",    value: "u.send('hi')", setter: "god", type: "attribute" },
        { name: "ADISCONNECT", value: "u.send('bye')", setter: "god", type: "attribute" }
      ]
    },
    contents: []
  }`;
  const extra = `u.db = { ...u.db, search: async () => [${npcObj}] };`;
  const result = await sandboxService.runScript(wrapScript(RAW_SWEEP, extra), ctx, SLOW) as SentMsg[];
  const allMsgs = result.map(r => r.msg).join("\n");
  assertStringIncludes(allMsgs, "ACONNECT");
  assertStringIncludes(allMsgs, "ADISCONNECT");
});

// ---------------------------------------------------------------------------
// @entrances tests
// ---------------------------------------------------------------------------

Deno.test("@entrances — no exits lead to room sends 'No exits'", OPTS, async () => {
  const ctx = makeCtx("player connected", "@entrances", []);
  const extra = `u.db = { ...u.db, search: async () => [] };`;
  const result = await sandboxService.runScript(wrapScript(RAW_ENTRANCES, extra), ctx, SLOW) as SentMsg[];
  assertStringIncludes(result.map(r => r.msg).join(" "), "No exits");
});

Deno.test("@entrances — exit with matching destination is shown", OPTS, async () => {
  const ctx = makeCtx("player connected", "@entrances", []);

  // The exit points to ROOM_ID (which is u.here.id in our ctx)
  const jsExit = `{
    id: "${EXIT_ID}",
    name: "West Gate",
    flags: new Set(["exit"]),
    location: "at_room2",
    state: { destination: "${ROOM_ID}" },
    contents: []
  }`;
  const jsRoom2 = `{
    id: "at_room2",
    name: "The Courtyard",
    flags: new Set(["room"]),
    state: {},
    contents: []
  }`;

  const extra = `
    let _searchCall = 0;
    u.db = {
      ...u.db,
      search: async (q) => {
        _searchCall++;
        if (_searchCall === 1) return [${jsExit}];
        return [${jsRoom2}];
      }
    };
  `;
  const result = await sandboxService.runScript(wrapScript(RAW_ENTRANCES, extra), ctx, SLOW) as SentMsg[];
  const allMsgs = result.map(r => r.msg).join("\n");
  assertStringIncludes(allMsgs, "West Gate");
  assertStringIncludes(allMsgs, "Courtyard");
});

Deno.test("@entrances — exit not pointing to room is excluded", OPTS, async () => {
  const ctx = makeCtx("player connected", "@entrances", []);

  // Exit points to a DIFFERENT room
  const jsExit = `{
    id: "${EXIT_ID}",
    name: "North Door",
    flags: new Set(["exit"]),
    location: "at_room2",
    state: { destination: "some_other_room" },
    contents: []
  }`;

  const extra = `u.db = { ...u.db, search: async () => [${jsExit}] };`;
  const result = await sandboxService.runScript(wrapScript(RAW_ENTRANCES, extra), ctx, SLOW) as SentMsg[];
  assertStringIncludes(result.map(r => r.msg).join(" "), "No exits");
});

Deno.test("@entrances — with explicit arg, looks up that location", OPTS, async () => {
  const ctx = makeCtx("player connected", "@entrances", ["SomeRoom"]);

  const jsTargetRoom = `{ id: "${DEST_ID}", name: "Target Hall", flags: new Set(["room"]), state: {}, contents: [] }`;
  const jsExit = `{ id: "${EXIT_ID}", name: "South Entry", flags: new Set(["exit"]), location: "at_room2", state: { destination: "${DEST_ID}" }, contents: [] }`;
  const jsRoom2 = `{ id: "at_room2", name: "Foyer", flags: new Set(["room"]), state: {}, contents: [] }`;

  const extra = `
    let _sc = 0;
    u.util = { ...u.util, target: async () => (${jsTargetRoom}) };
    u.db = { ...u.db, search: async (q) => { _sc++; if (_sc === 1) return [${jsExit}]; return [${jsRoom2}]; } };
  `;
  const result = await sandboxService.runScript(wrapScript(RAW_ENTRANCES, extra), ctx, SLOW) as SentMsg[];
  const allMsgs = result.map(r => r.msg).join("\n");
  assertStringIncludes(allMsgs, "South Entry");
  assertStringIncludes(allMsgs, "Foyer");
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

Deno.test("cleanup — close DB", OPTS, async () => {
  await cleanup(ACTOR_ID, TARGET_ID, DEST_ID, EXIT_ID, NPC_ID, ROOM_ID);
  await DBO.close();
});
