/**
 * tests/scripts_listen.test.ts
 *
 * Tests for @listen / @ahear NPC reaction system wired into say.ts.
 *
 * Verifies that when a player says something in a room, any object in that
 * room with a matching LISTEN attribute has its AHEAR attribute triggered.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

const RAW_SAY = await Deno.readTextFile("./system/scripts/say.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wraps say.ts for sandbox execution.
 * - Captures u.here.broadcast calls in _broadcast[]
 * - Captures trigger calls in _triggers[]
 * - Stubs u.ui.layout to prevent early promise resolution
 * - Returns { broadcast, triggers }
 */
function wrapSay(extra = ""): string {
  const stripped = RAW_SAY
    .replace(/^import\s.*?;\s*$/gm, "")
    .replace(/export const aliases.*?;/gs, "")
    .replace(/export default/, "_main =")
    .replace(/^export\s+/gm, "");
  return [
    "let _main;",
    stripped,
    "const _broadcast = [];",
    "const _triggers = [];",
    "u.here = { ...u.here, broadcast: (m) => _broadcast.push(m) };",
    "u.ui = { ...u.ui, layout: () => {}, panel: (o) => o };",
    // Capture trigger calls; stub out actual execution so tests are self-contained
    "u.trigger = async (id, attr, args) => { _triggers.push({ id, attr, args }); };",
    extra,
    "await _main(u);",
    "return { broadcast: _broadcast, triggers: _triggers };",
  ].join("\n");
}

type SayResult = { broadcast: string[]; triggers: { id: string; attr: string; args: string[] }[] };

const SLOW = { timeout: 10000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "sl_room1";
const ACTOR_ID = "sl_actor1";
const NPC_ID   = "sl_npc1";

function makeCtx(
  cmd: string,
  args: string[],
  actorState: Record<string, unknown> = {}
): SDKContext {
  return {
    id: ACTOR_ID,
    state: actorState,
    me: {
      id: ACTOR_ID,
      name: "Speaker",
      flags: new Set(["player", "connected"]),
      state: actorState,
      location: ROOM_ID,
    },
    here: { id: ROOM_ID, name: "Test Room", flags: new Set(["room"]), state: {} },
    cmd: { name: cmd, original: cmd, args, switches: [] },
    socketId: `sock-${ACTOR_ID}`,
  };
}

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test(
  "say — no LISTEN objects in room means no triggers fired",
  OPTS,
  async () => {
    // Room with no NPC
    const extra = `u.db = { ...u.db, search: async () => [] };`;
    const ctx = makeCtx("say", ["hello world"]);
    const result = await sandboxService.runScript(wrapSay(extra), ctx, SLOW) as SayResult;

    assertEquals(result.triggers.length, 0);
    assertStringIncludes(result.broadcast.join(" "), "hello world");
  }
);

Deno.test(
  "say — NPC with matching LISTEN pattern fires AHEAR trigger",
  OPTS,
  async () => {
    // NPC has LISTEN=hello and AHEAR attribute
    const npcObj = `{
      id: "${NPC_ID}",
      name: "Guard",
      flags: new Set(["thing"]),
      state: {
        attributes: [
          { name: "LISTEN", value: "hello", setter: "god", type: "attribute" },
          { name: "AHEAR", value: "u.send('Guard stirs.');", setter: "god", type: "attribute" }
        ]
      },
      contents: []
    }`;
    const extra = `u.db = { ...u.db, search: async () => [${npcObj}] };`;
    const ctx = makeCtx("say", ["hello world"]);
    const result = await sandboxService.runScript(wrapSay(extra), ctx, SLOW) as SayResult;

    assertEquals(result.triggers.length, 1);
    assertEquals(result.triggers[0].id, NPC_ID);
    assertEquals(result.triggers[0].attr, "AHEAR");
    // args[0] = the said message
    assertStringIncludes(result.triggers[0].args[0], "hello world");
  }
);

Deno.test(
  "say — NPC with non-matching LISTEN pattern does not fire AHEAR",
  OPTS,
  async () => {
    const npcObj = `{
      id: "${NPC_ID}",
      name: "Guard",
      flags: new Set(["thing"]),
      state: {
        attributes: [
          { name: "LISTEN", value: "goodbye", setter: "god", type: "attribute" }
        ]
      },
      contents: []
    }`;
    const extra = `u.db = { ...u.db, search: async () => [${npcObj}] };`;
    const ctx = makeCtx("say", ["hello world"]);
    const result = await sandboxService.runScript(wrapSay(extra), ctx, SLOW) as SayResult;

    assertEquals(result.triggers.length, 0);
  }
);

Deno.test(
  "say — LISTEN wildcard '*' matches any message",
  OPTS,
  async () => {
    const npcObj = `{
      id: "${NPC_ID}",
      name: "Echo",
      flags: new Set(["thing"]),
      state: {
        attributes: [
          { name: "LISTEN", value: "*", setter: "god", type: "attribute" },
          { name: "AHEAR",  value: "u.send('Echo hears you.');", setter: "god", type: "attribute" }
        ]
      },
      contents: []
    }`;
    const extra = `u.db = { ...u.db, search: async () => [${npcObj}] };`;
    const ctx = makeCtx("say", ["anything at all"]);
    const result = await sandboxService.runScript(wrapSay(extra), ctx, SLOW) as SayResult;

    assertEquals(result.triggers.length, 1);
    assertEquals(result.triggers[0].id, NPC_ID);
    assertEquals(result.triggers[0].attr, "AHEAR");
  }
);

Deno.test(
  "say — speaker is not triggered even if they match their own LISTEN",
  OPTS,
  async () => {
    // Speaker has a LISTEN attribute on themselves — should be skipped
    const speakerNpc = `{
      id: "${ACTOR_ID}",
      name: "Speaker",
      flags: new Set(["player", "connected"]),
      state: {
        attributes: [
          { name: "LISTEN", value: "*", setter: "god", type: "attribute" }
        ]
      },
      contents: []
    }`;
    const extra = `u.db = { ...u.db, search: async () => [${speakerNpc}] };`;
    const ctx = makeCtx("say", ["self-referential"]);
    const result = await sandboxService.runScript(wrapSay(extra), ctx, SLOW) as SayResult;

    // Speaker is excluded from LISTEN checks
    assertEquals(result.triggers.length, 0);
  }
);

// ---------------------------------------------------------------------------
// Security: C1 — oversized message must be truncated before AHEAR trigger
// ---------------------------------------------------------------------------

Deno.test(
  "C1 — oversized say message is truncated before being passed to AHEAR trigger",
  OPTS,
  async () => {
    // A message 10x the expected limit should arrive at AHEAR capped
    const hugMsg = "A".repeat(10_000);
    const npcObj = `{
      id: "${NPC_ID}",
      name: "Guard",
      flags: new Set(["thing"]),
      state: {
        attributes: [
          { name: "LISTEN", value: "*", setter: "god", type: "attribute" },
          { name: "AHEAR",  value: "u.send('ok');", setter: "god", type: "attribute" }
        ]
      },
      contents: []
    }`;
    const extra = `u.db = { ...u.db, search: async () => [${npcObj}] };`;
    const ctx = makeCtx("say", [hugMsg]);
    const result = await sandboxService.runScript(wrapSay(extra), ctx, SLOW) as SayResult;

    assertEquals(result.triggers.length, 1);
    // args[0] must be ≤ MAX_LISTEN_MSG_LEN — currently fails (no truncation)
    if (result.triggers[0].args[0].length > 2000) {
      throw new Error(
        `C1 EXPLOIT: AHEAR received ${result.triggers[0].args[0].length}-char message (> 2000); no truncation in place`
      );
    }
  }
);

Deno.test(
  "C1 — oversized LISTEN pattern is skipped even if inner substring matches",
  OPTS,
  async () => {
    // Pattern: "hello" + 9995 trailing spaces. _matchListen trims, so it WOULD match
    // "hello world" unless we reject the pattern BEFORE trimming.
    const hugePattern = "hello" + " ".repeat(9_995);
    const npcObj = `{
      id: "${NPC_ID}",
      name: "Bot",
      flags: new Set(["thing"]),
      state: {
        attributes: [
          { name: "LISTEN", value: ${JSON.stringify(hugePattern)}, setter: "god", type: "attribute" }
        ]
      },
      contents: []
    }`;
    const extra = `u.db = { ...u.db, search: async () => [${npcObj}] };`;
    const ctx = makeCtx("say", ["hello world"]);
    const result = await sandboxService.runScript(wrapSay(extra), ctx, SLOW) as SayResult;

    // Pattern > MAX_LISTEN_PATTERN_LEN must be rejected before matching
    if (result.triggers.length > 0) {
      throw new Error("C1 EXPLOIT: oversized LISTEN pattern was not rejected; DoS vector open");
    }
  }
);

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

Deno.test("cleanup — close DB", OPTS, async () => {
  await cleanup(ACTOR_ID, NPC_ID, ROOM_ID);
  await DBO.close();
});
