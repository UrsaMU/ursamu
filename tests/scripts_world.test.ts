// deno-lint-ignore-file require-await
/**
 * tests/scripts_world.test.ts
 *
 * Tests for engine-owned world-manipulation commands:
 *   - execTeleport  (@teleport)
 *   - execFind      (@find / @search)
 *   - execStats     (@stats)
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import { execTeleport, execFind, execStats } from "../src/commands/world.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "sw_room1";
const ACTOR_ID = "sw_actor1";

const room1: IDBObj  = { id: "sw_room1",  name: "Start Room",  flags: new Set(["room"]),   state: { name: "Start Room"  }, contents: [] };
const room2: IDBObj  = { id: "sw_room2",  name: "End Room",    flags: new Set(["room"]),   state: { name: "End Room"    }, contents: [] };
const thing: IDBObj  = { id: "sw_thing1", name: "Magic Orb",   flags: new Set(["thing"]),  state: { name: "Magic Orb"   }, contents: [] };
const exit1: IDBObj  = { id: "sw_exit1",  name: "North Exit",  flags: new Set(["exit"]),   state: { name: "North"       }, contents: [] };
const locked: IDBObj = { id: "sw_lr1",    name: "Locked Room", flags: new Set(["room"]),   state: { name: "Locked Room" }, contents: [] };
const player1: IDBObj= { id: "sw_p1",     name: "Player1",     flags: new Set(["player"]), state: { name: "Player1"     }, contents: [] };

function makeU(opts: {
  flags?: string[];
  cmdName?: string;
  args?: string[];
  switches?: string[];
  searchResults?: IDBObj[][];
  canEditFn?: (a: IDBObj, t: IDBObj) => boolean;
  teleportCalls?: string[][];
}): IUrsamuSDK & { sent: string[]; teleportCalls: string[][] } {
  const sent: string[] = [];
  const teleportCalls: string[][] = opts.teleportCalls ?? [];
  const me: IDBObj = {
    id: ACTOR_ID, name: "Actor",
    flags: new Set(opts.flags ?? ["player", "connected"]),
    state: { name: "Actor" },
    location: ROOM_ID, contents: [],
  };
  let searchCallIdx = 0;
  const searchMock = (opts.searchResults ?? [])
    ? async (_q: unknown) => {
        const batch = opts.searchResults ?? [];
        const idx = searchCallIdx++;
        return batch[idx] ?? [];
      }
    : async () => [];

  const u = {
    me,
    here: { id: ROOM_ID, name: "Test Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: {
      name: opts.cmdName ?? "@teleport",
      original: opts.cmdName ?? "@teleport",
      args: opts.args ?? [],
      switches: opts.switches ?? [],
    },
    send: (m: string) => sent.push(m),
    canEdit: (opts.canEditFn
      ? async (_a: IDBObj, t: IDBObj) => opts.canEditFn!(_a, t)
      : async () => true) as (a: IDBObj, t: IDBObj) => Promise<boolean>,
    teleport: (fromId: string, toId: string) => teleportCalls.push([fromId, toId]),
    db: { search: searchMock },
    util: {
      displayName: (o: IDBObj) => (o.state?.name as string) || o.name || o.id,
    },
    sys: {
      uptime: async () => 3_661_000,   // 1h 1m 1s
      gameTime: async () => ({ year: 5, month: 3, day: 10, hour: 14, minute: 30 }),
      setGameTime: async () => {},
    },
    events: { emit: async () => {} },
  } as unknown as IUrsamuSDK & { sent: string[]; teleportCalls: string[][] };
  (u as unknown as Record<string, unknown>).sent = sent;
  (u as unknown as Record<string, unknown>).teleportCalls = teleportCalls;
  return u;
}

// ===========================================================================
// execTeleport
// ===========================================================================

Deno.test("@teleport — no = sends usage", OPTS, async () => {
  const u = makeU({ args: ["Alice"] });
  await execTeleport(u);
  assertStringIncludes(u.sent.join(" "), "Usage");
});

Deno.test("@teleport — target not found", OPTS, async () => {
  const u = makeU({ args: ["Ghost=Room2"], searchResults: [[], []] });
  await execTeleport(u);
  assertStringIncludes(u.sent.join(" "), "Could not find target");
});

Deno.test("@teleport — destination not found", OPTS, async () => {
  const u = makeU({ flags: ["admin", "connected"], args: ["Magic Orb=Nowhere"], searchResults: [[thing], []] });
  await execTeleport(u);
  assertStringIncludes(u.sent.join(" "), "Could not find destination");
});

Deno.test("@teleport — permission denied on target", OPTS, async () => {
  const u = makeU({
    args: ["Magic Orb=End Room"],
    searchResults: [[thing], [room2]],
    canEditFn: () => false,
  });
  await execTeleport(u);
  assertStringIncludes(u.sent.join(" "), "Permission denied");
});

Deno.test("@teleport — permission denied on non-enter_ok destination", OPTS, async () => {
  const u = makeU({
    flags: ["admin", "connected"],
    args: ["Magic Orb=Locked Room"],
    searchResults: [[thing], [locked]],
    canEditFn: (_a, t) => t.id !== "sw_lr1",
  });
  await execTeleport(u);
  assertStringIncludes(u.sent.join(" "), "Permission denied");
});

Deno.test("@teleport — success calls teleport and sends confirmation", OPTS, async () => {
  const calls: string[][] = [];
  const u = makeU({
    flags: ["admin", "connected"],
    args: ["Magic Orb=End Room"],
    searchResults: [[thing], [room2]],
    teleportCalls: calls,
  });
  await execTeleport(u);
  assertEquals(calls.length, 1);
  assertEquals(calls[0], ["sw_thing1", "sw_room2"]);
  assertStringIncludes(u.sent.join(" "), "teleport");
  assertStringIncludes(u.sent.join(" "), "Magic Orb");
  assertStringIncludes(u.sent.join(" "), "End Room");
});

// ===========================================================================
// execFind
// ===========================================================================

Deno.test("@find — name search returns match", OPTS, async () => {
  const u = makeU({ cmdName: "@find", args: ["", "Magic Orb"], searchResults: [[thing]] });
  await execFind(u);
  assertStringIncludes(u.sent.join(" "), "Magic Orb");
});

Deno.test("@find — no results", OPTS, async () => {
  const u = makeU({ cmdName: "@find", args: ["", "Nonexistent"], searchResults: [[]] });
  await execFind(u);
  assertStringIncludes(u.sent.join(" "), "No objects found");
});

Deno.test("@find — flag search returns rooms", OPTS, async () => {
  const u = makeU({ cmdName: "@find", args: ["flag", "room"], searchResults: [[room1, room2]] });
  await execFind(u);
  assertStringIncludes(u.sent.join(" "), "Start Room");
});

Deno.test("@find — no arg sends usage", OPTS, async () => {
  const u = makeU({ cmdName: "@find", args: ["", ""] });
  await execFind(u);
  assertStringIncludes(u.sent.join(" "), "Usage");
});

// ===========================================================================
// execStats
// ===========================================================================

Deno.test("@stats — shows connected count and uptime", OPTS, async () => {
  const u = makeU({
    cmdName: "@stats", args: [],
    searchResults: [[player1]],  // connected players search
  });
  await execStats(u);
  const out = u.sent.join(" ");
  assertStringIncludes(out, "Connected");
  assertStringIncludes(out, "Uptime");
});

Deno.test("@stats/full — shows total object counts with breakdown", OPTS, async () => {
  const all = [room1, room2, exit1, thing, player1];
  const u = makeU({
    cmdName: "@stats", args: ["full"],
    // First call: connected filter; second call: all objects ({})
    searchResults: [[player1], all],
  });
  await execStats(u);
  const out = u.sent.join(" ");
  assertStringIncludes(out, "Total objs");
  assertStringIncludes(out, "5");
  assertStringIncludes(out, "Rooms");
  assertStringIncludes(out, "Players");
});
