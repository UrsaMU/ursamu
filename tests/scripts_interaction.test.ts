/**
 * tests/scripts_interaction.test.ts
 *
 * Tests for player-interaction system scripts:
 *   - get.ts    (pick up an object)
 *   - drop.ts   (drop an object from inventory)
 *   - give.ts   (give object or money to another player)
 *   - home.ts   (teleport to home)
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

const RAW_GET  = await Deno.readTextFile("./system/scripts/get.ts");
const RAW_DROP = await Deno.readTextFile("./system/scripts/drop.ts");
const RAW_GIVE = await Deno.readTextFile("./system/scripts/give.ts");
const RAW_HOME = await Deno.readTextFile("./system/scripts/home.ts");
const RAW_TRIGGER = await Deno.readTextFile("./system/scripts/trigger.ts");

/** Strip imports/exports so the script runs as legacy block code */
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
    "const _origSend = u.send.bind(u);",
    "u.send = (m, t, o) => { _sent.push({ msg: m, target: t }); _origSend(m, t, o); };",
    extra,
    "await _main(u);",
    "return _sent;",
  ].join("\n");
}

const SLOW = { timeout: 10000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "si_room1";
const ACTOR_ID = "si_actor1";
const RECV_ID  = "si_recv1";
const THING_ID = "si_thing1";

async function makeCtx(
  actorId: string,
  cmd: string,
  args: string[]
): Promise<SDKContext> {
  // dbojs.queryOne returns IDBOBJ | undefined | false; cast to IDBOBJ for convenience
  // deno-lint-ignore no-explicit-any
  const actor = (await dbojs.queryOne({ id: actorId })) as any;
  return {
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
}

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

// ===========================================================================
// get.ts — pick up
// ===========================================================================

Deno.test("@get — no args sends 'Get what?'", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Tester" }, location: ROOM_ID });
  const ctx = await makeCtx(ACTOR_ID, "get", []);
  const result = await sandboxService.runScript(wrapScript(RAW_GET), ctx, SLOW) as { msg: string }[];
  assertStringIncludes(result[0]?.msg ?? "", "Get what");
  await cleanup(ACTOR_ID);
});

Deno.test("@get — picks up a thing in the same room and moves it to inventory", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Tester" }, location: ROOM_ID });
  await dbojs.create({ id: THING_ID, flags: "thing", data: { name: "Shiny Orb" }, location: ROOM_ID });

  const ctx = await makeCtx(ACTOR_ID, "get", ["Shiny Orb"]);
  const result = await sandboxService.runScript(wrapScript(RAW_GET), ctx, SLOW) as { msg: string }[];

  assertStringIncludes(result[0]?.msg ?? "", "pick up");

  const updated = await dbojs.queryOne({ id: THING_ID });
  assertEquals((updated as { location?: string } | undefined)?.location, ACTOR_ID);

  await cleanup(ACTOR_ID, THING_ID);
});

Deno.test("@get — cannot pick up a player", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Tester" }, location: ROOM_ID });
  await dbojs.create({ id: RECV_ID,  flags: "player connected", data: { name: "Victim" }, location: ROOM_ID });

  const ctx = await makeCtx(ACTOR_ID, "get", ["Victim"]);
  const result = await sandboxService.runScript(wrapScript(RAW_GET), ctx, SLOW) as { msg: string }[];

  assertStringIncludes(result[0]?.msg ?? "", "can't pick up players");

  await cleanup(ACTOR_ID, RECV_ID);
});

Deno.test("@get — cannot pick up an exit", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Tester" }, location: ROOM_ID });
  await dbojs.create({ id: "si_exit1", flags: "exit", data: { name: "North" }, location: ROOM_ID });

  const ctx = await makeCtx(ACTOR_ID, "get", ["North"]);
  const result = await sandboxService.runScript(wrapScript(RAW_GET), ctx, SLOW) as { msg: string }[];

  assertStringIncludes(result[0]?.msg ?? "", "can't pick that up");

  await cleanup(ACTOR_ID, "si_exit1");
});

Deno.test("@get — thing not in same room returns 'don't see that here'", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Tester" }, location: ROOM_ID });
  await dbojs.create({ id: THING_ID, flags: "thing", data: { name: "FarBall" }, location: "si_other_room" });

  const ctx = await makeCtx(ACTOR_ID, "get", ["FarBall"]);
  const result = await sandboxService.runScript(wrapScript(RAW_GET), ctx, SLOW) as { msg: string }[];

  assertStringIncludes(result[0]?.msg ?? "", "don't see");

  await cleanup(ACTOR_ID, THING_ID);
});

// ===========================================================================
// drop.ts — drop
// ===========================================================================

Deno.test("@drop — no args sends 'Drop what?'", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Tester" }, location: ROOM_ID });
  const ctx = await makeCtx(ACTOR_ID, "drop", []);
  const result = await sandboxService.runScript(wrapScript(RAW_DROP), ctx, SLOW) as { msg: string }[];
  assertStringIncludes(result[0]?.msg ?? "", "Drop what");
  await cleanup(ACTOR_ID);
});

Deno.test("@drop — drops a thing from inventory to room", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Tester" }, location: ROOM_ID });
  await dbojs.create({ id: THING_ID, flags: "thing", data: { name: "RedBall" }, location: ACTOR_ID });

  const ctx = await makeCtx(ACTOR_ID, "drop", ["RedBall"]);
  const result = await sandboxService.runScript(wrapScript(RAW_DROP), ctx, SLOW) as { msg: string }[];

  assertStringIncludes(result[0]?.msg ?? "", "drop");

  const updated = await dbojs.queryOne({ id: THING_ID });
  assertEquals((updated as { location?: string } | undefined)?.location, ROOM_ID);

  await cleanup(ACTOR_ID, THING_ID);
});

Deno.test("@drop — thing not in inventory sends 'aren't carrying that'", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Tester" }, location: ROOM_ID });
  await dbojs.create({ id: THING_ID, flags: "thing", data: { name: "GreenBall" }, location: ROOM_ID });

  const ctx = await makeCtx(ACTOR_ID, "drop", ["GreenBall"]);
  const result = await sandboxService.runScript(wrapScript(RAW_DROP), ctx, SLOW) as { msg: string }[];

  assertStringIncludes(result[0]?.msg ?? "", "aren't carrying");

  await cleanup(ACTOR_ID, THING_ID);
});

// ===========================================================================
// give.ts — give
// ===========================================================================

Deno.test("@give — no args sends 'Give what to whom?'", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Giver" }, location: ROOM_ID });
  const ctx = await makeCtx(ACTOR_ID, "give", []);
  const result = await sandboxService.runScript(wrapScript(RAW_GIVE), ctx, SLOW) as { msg: string }[];
  assertStringIncludes(result[0]?.msg ?? "", "Give what to whom");
  await cleanup(ACTOR_ID);
});

Deno.test("@give — receiver not in same room sends 'aren't here'", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Giver" }, location: ROOM_ID });
  await dbojs.create({ id: RECV_ID,  flags: "player connected", data: { name: "FarAway" }, location: "si_room2" });

  const ctx = await makeCtx(ACTOR_ID, "give", ["something", "FarAway"]);
  const result = await sandboxService.runScript(wrapScript(RAW_GIVE), ctx, SLOW) as { msg: string }[];

  assertStringIncludes(result[0]?.msg ?? "", "aren't here");

  await cleanup(ACTOR_ID, RECV_ID);
});

Deno.test("@give — can only give things to players (not objects)", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Giver" }, location: ROOM_ID });
  await dbojs.create({ id: THING_ID, flags: "thing", data: { name: "Box" }, location: ROOM_ID });

  const ctx = await makeCtx(ACTOR_ID, "give", ["something", "Box"]);
  const result = await sandboxService.runScript(wrapScript(RAW_GIVE), ctx, SLOW) as { msg: string }[];

  assertStringIncludes(result[0]?.msg ?? "", "can only give things to players");

  await cleanup(ACTOR_ID, THING_ID);
});

Deno.test("@give — give an object transfers it to receiver", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Giver" }, location: ROOM_ID });
  await dbojs.create({ id: RECV_ID,  flags: "player connected", data: { name: "Receiver" }, location: ROOM_ID });
  await dbojs.create({ id: THING_ID, flags: "thing", data: { name: "Gem" }, location: ACTOR_ID });

  const ctx = await makeCtx(ACTOR_ID, "give", ["Gem", "Receiver"]);
  await sandboxService.runScript(wrapScript(RAW_GIVE), ctx, SLOW);

  const updated = await dbojs.queryOne({ id: THING_ID });
  assertEquals((updated as { location?: string } | undefined)?.location, RECV_ID);

  await cleanup(ACTOR_ID, RECV_ID, THING_ID);
});

Deno.test("@give — give money sends confirmation message", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Giver", money: 100 }, location: ROOM_ID });
  await dbojs.create({ id: RECV_ID,  flags: "player connected", data: { name: "Receiver", money: 10 }, location: ROOM_ID });

  const ctx = await makeCtx(ACTOR_ID, "give", ["50", "Receiver"]);
  const result = await sandboxService.runScript(wrapScript(RAW_GIVE), ctx, SLOW) as { msg: string }[];

  assertStringIncludes(result[0]?.msg ?? "", "coins");

  await cleanup(ACTOR_ID, RECV_ID);
});

Deno.test("@give — give money with insufficient funds fails", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Giver", money: 5 }, location: ROOM_ID });
  await dbojs.create({ id: RECV_ID,  flags: "player connected", data: { name: "Receiver2", money: 0 }, location: ROOM_ID });

  // money is in actor.state (from DB data)
  const ctx = await makeCtx(ACTOR_ID, "give", ["100", "Receiver2"]);
  const result = await sandboxService.runScript(wrapScript(RAW_GIVE), ctx, SLOW) as { msg: string }[];

  assertStringIncludes(result[0]?.msg ?? "", "don't have that much money");

  await cleanup(ACTOR_ID, RECV_ID);
});

// ===========================================================================
// home.ts — go home
// ===========================================================================

Deno.test("home — sends 'home' message", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Traveler", home: ROOM_ID }, location: "si_other" });

  const ctx: SDKContext = {
    id: ACTOR_ID,
    state: { home: ROOM_ID },
    me: { id: ACTOR_ID, name: "Traveler", flags: new Set(["player", "connected"]), location: "si_other", state: { home: ROOM_ID } },
    here: { id: "si_other", name: "Somewhere Else", flags: new Set(["room"]), state: {} },
    cmd: { name: "home", original: "home", args: [], switches: [] },
    socketId: `sock-${ACTOR_ID}`,
  };

  // Stub u.teleport so we don't actually trigger a teleport message handler
  const extra = `const _origTeleport = u.teleport; u.teleport = () => {};`;
  const result = await sandboxService.runScript(wrapScript(RAW_HOME, extra), ctx, SLOW) as { msg: string }[];

  assertStringIncludes(result[0]?.msg ?? "", "home");

  await cleanup(ACTOR_ID);
});

// ===========================================================================
// trigger.ts — trigger an attribute
// ===========================================================================

Deno.test("@trigger — missing authorization vulnerability (RED phase)", OPTS, async () => {
  await dbojs.create({ id: ACTOR_ID, flags: "player connected", data: { name: "Attacker" }, location: ROOM_ID });
  // Target owned by someone else (make it an admin player so the fallback power check fails)
  await dbojs.create({ id: THING_ID, flags: "player admin", data: { name: "AdminPlayer", owner: "admin_id" }, location: ROOM_ID });

  const ctx = await makeCtx(ACTOR_ID, "trigger", ["AdminPlayer/EXPLODE"]);
  ctx.permissions = { [THING_ID]: false };
  
  // Try to trigger the attribute
  const result = await sandboxService.runScript(wrapScript(RAW_TRIGGER), ctx, SLOW) as { msg: string }[];
  
  const msgs = result.map(r => r.msg).join(" ");
  // If the vulnerability exists, the script will silently execute the trigger
  // and NOT send "Permission denied."
  // By asserting it DOES include "Permission denied.", this test should FAIL in the RED phase.
  assertStringIncludes(msgs, "Permission denied.");

  await cleanup(ACTOR_ID, THING_ID);
});

// Close the DB after all tests
Deno.test("cleanup — close DB", OPTS, async () => {
  await DBO.close();
});
