/**
 * tests/scripts_object_attrs.test.ts
 *
 * Tests for @o* / @a* attribute messaging on objects:
 *   - get.ts   — SUCC fires to actor; OSUCC fires to room
 *   - drop.ts  — DROP fires to actor
 *   - look.ts  — ODESC fires to room when looking at non-room object
 */
import { assertStringIncludes } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

const RAW_GET  = await Deno.readTextFile("./system/scripts/get.ts");
const RAW_DROP = await Deno.readTextFile("./system/scripts/drop.ts");
const RAW_LOOK = await Deno.readTextFile("./system/scripts/look.ts");

/**
 * Wraps a script, capturing both u.send (→ _sent) and u.here.broadcast (→ _broadcast).
 * Stubs u.ui.layout so look.ts doesn't resolve early.
 * Returns { sent: string[], broadcast: string[] }.
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

const SLOW = { timeout: 10000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "oa_room1";
const ACTOR_ID = "oa_actor1";
const THING_ID = "oa_thing1";

async function makeCtx(
  actorId: string,
  cmd: string,
  args: string[],
  target?: { id: string; name: string; flags: string }
): Promise<SDKContext> {
  // deno-lint-ignore no-explicit-any
  const actor = (await dbojs.queryOne({ id: actorId })) as any;
  const ctx: SDKContext = {
    id: actorId,
    state: actor?.data || {},
    me: {
      id: actorId,
      name: (actor?.data?.name as string) || actorId,
      flags: new Set((actor?.flags || "player").split(" ")),
      location: actor?.location as string | undefined,
      state: (actor?.data as Record<string, unknown>) || {},
    },
    here: { id: ROOM_ID, name: "Test Room", flags: new Set(["room"]), state: {} },
    cmd: { name: cmd, original: cmd, args, switches: [] },
    socketId: `sock-${actorId}`,
  };
  if (target) {
    ctx.target = {
      id: target.id,
      name: target.name,
      flags: new Set(target.flags.split(" ")),
      state: {},
    };
  }
  return ctx;
}

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

// ===========================================================================
// get.ts — SUCC attribute fires to actor
// ===========================================================================

Deno.test("@get with SUCC — actor receives the SUCC text instead of default", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Tester" }, location: ROOM_ID });
  await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Magic Orb", attributes: [{ name: "SUCC", value: "The orb glows as you pick it up!", setter: "sys" }] },
    location: ROOM_ID,
  });

  const ctx = await makeCtx(ACTOR_ID, "get", ["Magic Orb"]);
  const result = await sandboxService.runScript(wrapScript(RAW_GET), ctx, SLOW) as { sent: string[]; broadcast: string[] };

  assertStringIncludes(result.sent.join(" "), "The orb glows as you pick it up!");

  await cleanup(ACTOR_ID, THING_ID);
});

// ===========================================================================
// get.ts — OSUCC attribute fires to room
// ===========================================================================

Deno.test("@get with OSUCC — room broadcast contains the OSUCC text", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Tester" }, location: ROOM_ID });
  await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Gem", attributes: [{ name: "OSUCC", value: "carefully lifts the gem into the air.", setter: "sys" }] },
    location: ROOM_ID,
  });

  const ctx = await makeCtx(ACTOR_ID, "get", ["Gem"]);
  const result = await sandboxService.runScript(wrapScript(RAW_GET), ctx, SLOW) as { sent: string[]; broadcast: string[] };

  assertStringIncludes(result.broadcast.join(" "), "carefully lifts the gem into the air.");

  await cleanup(ACTOR_ID, THING_ID);
});

// ===========================================================================
// drop.ts — DROP attribute fires to actor
// ===========================================================================

Deno.test("@drop with DROP — actor receives the DROP text instead of default", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Tester" }, location: ROOM_ID });
  await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "Vase", attributes: [{ name: "DROP", value: "The vase shatters as it hits the floor!", setter: "sys" }] },
    location: ACTOR_ID,
  });

  const ctx = await makeCtx(ACTOR_ID, "drop", ["Vase"]);
  const result = await sandboxService.runScript(wrapScript(RAW_DROP), ctx, SLOW) as { sent: string[]; broadcast: string[] };

  assertStringIncludes(result.sent.join(" "), "The vase shatters as it hits the floor!");

  await cleanup(ACTOR_ID, THING_ID);
});

// ===========================================================================
// look.ts — ODESC attribute fires room broadcast when looking at an object
// ===========================================================================

Deno.test("@look at object with ODESC — room broadcast fires", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Observer" }, location: ROOM_ID });
  await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: {
      name: "Painting",
      attributes: [{ name: "ODESC", value: "studies the painting with great interest.", setter: "sys" }],
    },
    location: ROOM_ID,
  });

  const ctx = await makeCtx(ACTOR_ID, "look", ["Painting"], { id: THING_ID, name: "Painting", flags: "thing" });
  const result = await sandboxService.runScript(wrapScript(RAW_LOOK), ctx, SLOW) as { sent: string[]; broadcast: string[] };

  assertStringIncludes(result.broadcast.join(" "), "studies the painting with great interest.");

  await cleanup(ACTOR_ID, THING_ID);
});

// ===========================================================================
// no-attribute fallback — default messages still fire when no attrs set
// ===========================================================================

Deno.test("@get without attributes — default 'pick up' message fires", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Tester" }, location: ROOM_ID });
  await dbojs.create({ id: THING_ID, flags: "thing", data: { name: "Stone" }, location: ROOM_ID });

  const ctx = await makeCtx(ACTOR_ID, "get", ["Stone"]);
  const result = await sandboxService.runScript(wrapScript(RAW_GET), ctx, SLOW) as { sent: string[]; broadcast: string[] };

  assertStringIncludes(result.sent.join(" "), "pick up");

  await cleanup(ACTOR_ID, THING_ID);
});

// Close the DB after all tests
Deno.test("cleanup — close DB", OPTS, async () => {
  await DBO.close();
});
