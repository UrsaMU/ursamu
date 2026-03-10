/**
 * tests/scripts_comms.test.ts
 *
 * Tests for player communication, utility, and channel management scripts:
 *   - think.ts         (private echo to self)
 *   - score.ts         (player scorecard)
 *   - say.ts           (broadcast to room)
 *   - pose.ts          (emote/pose to room)
 *   - who.ts           (list connected players)
 *   - channels.ts      (@channel/join, @channel/leave, @channel/list)
 *   - chancreate.ts    (admin: create channel)
 *   - chandestroy.ts   (admin: destroy channel)
 *   - chanset.ts       (admin: set channel properties)
 */
import { assertStringIncludes } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

// ---------------------------------------------------------------------------
// Raw script text
// ---------------------------------------------------------------------------
const RAW_THINK       = await Deno.readTextFile("./system/scripts/think.ts");
const RAW_SCORE       = await Deno.readTextFile("./system/scripts/score.ts");
const RAW_SAY         = await Deno.readTextFile("./system/scripts/say.ts");
const RAW_POSE        = await Deno.readTextFile("./system/scripts/pose.ts");
const RAW_WHO         = await Deno.readTextFile("./system/scripts/who.ts");
const RAW_CHANNELS    = await Deno.readTextFile("./system/scripts/channels.ts");
const RAW_CHANCREATE  = await Deno.readTextFile("./system/scripts/chancreate.ts");
const RAW_CHANDESTROY = await Deno.readTextFile("./system/scripts/chandestroy.ts");
const RAW_CHANSET     = await Deno.readTextFile("./system/scripts/chanset.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wraps a script for sandbox execution.
 * - Strips ESM import/export syntax
 * - Captures u.send calls in _sent[]
 * - Captures u.here.broadcast calls in _broadcast[]
 * - Stubs u.ui.layout to prevent early promise resolution
 * - Returns { sent, broadcast }
 */
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
    "const _broadcast = [];",
    "const _origSend = u.send.bind(u);",
    "u.send = (m, t, o) => { _sent.push(m); _origSend(m, t, o); };",
    "u.here = { ...u.here, broadcast: (m) => _broadcast.push(m) };",
    "u.ui = { ...u.ui, layout: () => {}, panel: (o) => o };",
    extra,
    "await _main(u);",
    "return { sent: _sent, broadcast: _broadcast };",
  ].join("\n");
}

type ScriptResult = { sent: string[]; broadcast: string[] };

const SLOW = { timeout: 10000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "sc_room1";
const ACTOR_ID = "sc_actor1";
const OTHER_ID = "sc_other1";

function makeCtx(
  id: string,
  flags: string,
  name: string,
  cmd: string,
  args: string[],
  state: Record<string, unknown> = {},
  switches: string[] = []
): SDKContext {
  return {
    id,
    state,
    me: { id, name, flags: new Set(flags.split(" ")), state },
    here: { id: ROOM_ID, name: "Test Room", flags: new Set(["room"]), state: {} },
    cmd: { name: cmd, original: cmd, args, switches },
    socketId: `sock-${id}`,
  };
}

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

// ===========================================================================
// think.ts
// ===========================================================================

Deno.test("think — no args sends 'What do you want to think?'", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Thinker", "think", []);
  const result = await sandboxService.runScript(wrapScript(RAW_THINK), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "What do you want to think");
});

Deno.test("think — echoes message back to sender", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Thinker", "think", ["A deep thought."]);
  const result = await sandboxService.runScript(wrapScript(RAW_THINK), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "A deep thought.");
});

// ===========================================================================
// score.ts
// ===========================================================================

Deno.test("score — sends scorecard with player name", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Scorer", "score", [], { name: "Scorer", money: 42 });
  const result = await sandboxService.runScript(wrapScript(RAW_SCORE), ctx, SLOW) as ScriptResult;
  const out = result.sent.join(" ");
  assertStringIncludes(out, "Scorer");
  assertStringIncludes(out, "42");
});

Deno.test("score — shows zero money when not set", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Broke", "score", [], { name: "Broke" });
  const result = await sandboxService.runScript(wrapScript(RAW_SCORE), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "0");
});

// ===========================================================================
// say.ts
// ===========================================================================

Deno.test("say — no args sends 'What do you want to say?'", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Talker", "say", [""]);
  const result = await sandboxService.runScript(wrapScript(RAW_SAY), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "What do you want to say");
});

Deno.test("say — broadcasts message to room with actor name", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Talker", "say", ["Hello, world!"]);
  const result = await sandboxService.runScript(wrapScript(RAW_SAY), ctx, SLOW) as ScriptResult;
  const bcast = result.broadcast.join(" ");
  assertStringIncludes(bcast, "Talker");
  assertStringIncludes(bcast, "Hello, world!");
  assertStringIncludes(bcast, "says");
});

Deno.test("say — uses moniker over name when set", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Talker", "say", ["Hi!"], { moniker: "The Magnificent" });
  const result = await sandboxService.runScript(wrapScript(RAW_SAY), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.broadcast.join(" "), "The Magnificent");
});

// ===========================================================================
// pose.ts
// ===========================================================================

Deno.test("pose — no args sends 'Pose what?'", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Poser", "pose", [""]);
  const result = await sandboxService.runScript(
    wrapScript(RAW_POSE, "u.db = { ...u.db, search: async () => [] };"),
    ctx,
    SLOW
  ) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "Pose what");
});

Deno.test("pose — broadcasts emote to room", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Poser", "pose", ["stretches dramatically."]);
  const result = await sandboxService.runScript(
    wrapScript(RAW_POSE, "u.db = { ...u.db, search: async () => [] };"),
    ctx,
    SLOW
  ) as ScriptResult;
  const bcast = result.broadcast.join(" ");
  assertStringIncludes(bcast, "Poser");
  assertStringIncludes(bcast, "stretches dramatically.");
});

Deno.test("pose — semipose omits space between name and text", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Poser", ";", ["'s eyes glow."]);
  const result = await sandboxService.runScript(
    wrapScript(RAW_POSE, "u.db = { ...u.db, search: async () => [] };"),
    ctx,
    SLOW
  ) as ScriptResult;
  const bcast = result.broadcast.join(" ");
  assertStringIncludes(bcast, "Poser's eyes glow.");
});

// ===========================================================================
// who.ts
// ===========================================================================

Deno.test("who — shows '0 players online' when DB is empty", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Asker", "who", []);
  const result = await sandboxService.runScript(
    // Stub db.search to return empty list (who.ts searches with string 'connected')
    wrapScript(RAW_WHO, "u.db = { ...u.db, search: async () => [] };"),
    ctx,
    SLOW
  ) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "0");
  assertStringIncludes(result.sent.join(" "), "online");
});

Deno.test("who — lists connected players from search results", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Asker", "who", []);
  // Stub db.search to return fake connected players
  const extra = `
    u.db = { ...u.db, search: async () => [
      { id: "p1", name: "Alice", flags: new Set(["player", "connected"]), state: { name: "Alice", doing: "Being awesome" }, contents: [] },
      { id: "p2", name: "Bob",   flags: new Set(["player", "connected"]), state: { name: "Bob",   doing: "" }, contents: [] }
    ]};
  `;
  const result = await sandboxService.runScript(wrapScript(RAW_WHO, extra), ctx, SLOW) as ScriptResult;
  const out = result.sent.join(" ");
  assertStringIncludes(out, "Alice");
  assertStringIncludes(out, "Bob");
  assertStringIncludes(out, "2");
});

Deno.test("who — dark players are excluded", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Asker", "who", []);
  const extra = `
    u.db = { ...u.db, search: async () => [
      { id: "p1", name: "Visible", flags: new Set(["player", "connected"]),        state: { name: "Visible" }, contents: [] },
      { id: "p2", name: "Shadow",  flags: new Set(["player", "connected", "dark"]), state: { name: "Shadow"  }, contents: [] }
    ]};
  `;
  const result = await sandboxService.runScript(wrapScript(RAW_WHO, extra), ctx, SLOW) as ScriptResult;
  const out = result.sent.join(" ");
  assertStringIncludes(out, "Visible");
  // Shadow should not appear
  assertStringIncludes(out, "1");
});

// ===========================================================================
// channels.ts — @channel/list, @channel/join, @channel/leave
// ===========================================================================

Deno.test("@channel/list — sends channel list header and footer", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "ChanUser", "channel", [""], {}, ["list"]);
  const extra = `u.chan = { ...u.chan, list: async () => [{ name: "public", alias: "pub" }] };`;
  const result = await sandboxService.runScript(wrapScript(RAW_CHANNELS, extra), ctx, SLOW) as ScriptResult;
  const out = result.sent.join(" ");
  assertStringIncludes(out, "public");
  assertStringIncludes(out, "pub");
});

Deno.test("@channel/join — joins channel and sends confirmation", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "ChanUser", "channel/join", ["public=pub"]);
  const extra = `u.chan = { ...u.chan, join: async () => {} };`;
  const result = await sandboxService.runScript(wrapScript(RAW_CHANNELS, extra), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "joined");
});

Deno.test("@channel/leave — leaves channel and sends confirmation", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "ChanUser", "channel/leave", ["pub"]);
  const extra = `u.chan = { ...u.chan, leave: async () => {} };`;
  const result = await sandboxService.runScript(wrapScript(RAW_CHANNELS, extra), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "left");
});

// ===========================================================================
// chancreate.ts
// ===========================================================================

Deno.test("@chancreate — non-admin gets permission denied", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Rando", "@chancreate", ["public"]);
  const result = await sandboxService.runScript(wrapScript(RAW_CHANCREATE), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "Permission denied");
});

Deno.test("@chancreate — no args sends usage", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "admin connected", "Admin", "@chancreate", [""]);
  const result = await sandboxService.runScript(wrapScript(RAW_CHANCREATE), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "Usage");
});

Deno.test("@chancreate — admin creates channel", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "admin connected", "Admin", "@chancreate", ["public=[PUB]"]);
  const extra = `u.chan = { ...u.chan, create: async (n, o) => ({ id: n, name: n, header: o?.header || '[' + n.toUpperCase() + ']' }) };`;
  const result = await sandboxService.runScript(wrapScript(RAW_CHANCREATE, extra), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "created");
  assertStringIncludes(result.sent.join(" "), "public");
});

Deno.test("@chancreate — wizard also has permission", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "wizard connected", "Wiz", "@chancreate", ["staff"]);
  const extra = `u.chan = { ...u.chan, create: async (n, o) => ({ id: n, name: n, header: '[' + n.toUpperCase() + ']' }) };`;
  const result = await sandboxService.runScript(wrapScript(RAW_CHANCREATE, extra), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "created");
});

// ===========================================================================
// chandestroy.ts
// ===========================================================================

Deno.test("@chandestroy — non-admin gets permission denied", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Rando", "@chandestroy", ["public"]);
  const result = await sandboxService.runScript(wrapScript(RAW_CHANDESTROY), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "Permission denied");
});

Deno.test("@chandestroy — no args sends usage", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "admin connected", "Admin", "@chandestroy", [""]);
  const result = await sandboxService.runScript(wrapScript(RAW_CHANDESTROY), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "Usage");
});

Deno.test("@chandestroy — propagates error from service", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "admin connected", "Admin", "@chandestroy", ["nonexistent"]);
  const extra = `u.chan = { ...u.chan, destroy: async () => ({ error: "Channel not found." }) };`;
  const result = await sandboxService.runScript(wrapScript(RAW_CHANDESTROY, extra), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "not found");
});

Deno.test("@chandestroy — admin destroys channel", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "admin connected", "Admin", "@chandestroy", ["public"]);
  const extra = `u.chan = { ...u.chan, destroy: async () => ({ ok: true }) };`;
  const result = await sandboxService.runScript(wrapScript(RAW_CHANDESTROY, extra), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "destroyed");
  assertStringIncludes(result.sent.join(" "), "public");
});

// ===========================================================================
// chanset.ts
// ===========================================================================

Deno.test("@chanset — non-admin gets permission denied", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "player connected", "Rando", "@chanset", ["public/header=[PUB]"]);
  const result = await sandboxService.runScript(wrapScript(RAW_CHANSET), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "Permission denied");
});

Deno.test("@chanset — bad format sends usage", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "admin connected", "Admin", "@chanset", ["public"]);
  const result = await sandboxService.runScript(wrapScript(RAW_CHANSET), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "Usage");
});

Deno.test("@chanset — unknown property sends error", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "admin connected", "Admin", "@chanset", ["public/color=red"]);
  const extra = `u.chan = { ...u.chan, set: async () => ({ ok: true }) };`;
  const result = await sandboxService.runScript(wrapScript(RAW_CHANSET, extra), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "Unknown property");
});

Deno.test("@chanset — admin sets header", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "admin connected", "Admin", "@chanset", ["public/header=[PUB]"]);
  const extra = `u.chan = { ...u.chan, set: async () => ({ ok: true }) };`;
  const result = await sandboxService.runScript(wrapScript(RAW_CHANSET, extra), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "header");
  assertStringIncludes(result.sent.join(" "), "[PUB]");
});

Deno.test("@chanset — admin sets lock", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "admin connected", "Admin", "@chanset", ["public/lock=player+"]);
  const extra = `u.chan = { ...u.chan, set: async () => ({ ok: true }) };`;
  const result = await sandboxService.runScript(wrapScript(RAW_CHANSET, extra), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "lock");
  assertStringIncludes(result.sent.join(" "), "player+");
});

Deno.test("@chanset — admin sets hidden=on", OPTS, async () => {
  const ctx = makeCtx(ACTOR_ID, "admin connected", "Admin", "@chanset", ["public/hidden=on"]);
  const extra = `u.chan = { ...u.chan, set: async () => ({ ok: true }) };`;
  const result = await sandboxService.runScript(wrapScript(RAW_CHANSET, extra), ctx, SLOW) as ScriptResult;
  assertStringIncludes(result.sent.join(" "), "hidden");
});

// ===========================================================================
// Cleanup
// ===========================================================================

Deno.test("cleanup — close DB", OPTS, async () => {
  await cleanup(ACTOR_ID, OTHER_ID, ROOM_ID);
  await DBO.close();
});
