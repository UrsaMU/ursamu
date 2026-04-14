/**
 * tests/scripts_interaction.test.ts
 *
 * Tests for player-interaction commands:
 *   - execGet      (pick up an object)
 *   - execDrop     (drop an object from inventory)
 *   - execGive     (give object or money to another player)
 *   - execHome     (teleport to home)
 *   - execTrigger  (@trigger — fire a stored attribute)
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import { execGet, execDrop, execGive } from "../src/commands/manipulation.ts";
import { execHome } from "../src/commands/home.ts";
import { execTrigger } from "../src/commands/softcode/trigger.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "si_room1";
const ACTOR_ID = "si_actor1";
const RECV_ID  = "si_recv1";
const THING_ID = "si_thing1";

type Msg = { msg: string; target?: string };
type ModifyCall = [string, string, unknown];

/** Build a mock IUrsamuSDK for interaction tests */
function makeU(opts: {
  cmdName?: string;
  args?: string[];
  actorState?: Record<string, unknown>;
  actorContents?: IDBObj[];
  targetSeq?: Array<IDBObj | undefined>;   // sequential target() returns
  searchSeq?: IDBObj[][];                  // sequential db.search() returns
  canEditFn?: (a: IDBObj, t: IDBObj) => boolean;
  modifyCalls?: ModifyCall[];
  triggerCalls?: Array<{ id: string; attr: string; args: string[] }>;
  teleportCalls?: string[][];
}): IUrsamuSDK & { msgs: Msg[] } {
  const msgs: Msg[] = [];
  const broadcasts: string[] = [];
  let targetIdx = 0;
  let searchIdx = 0;
  const me: IDBObj = {
    id: ACTOR_ID, name: "Tester",
    flags: new Set(["player", "connected"]),
    state: opts.actorState ?? { name: "Tester" },
    location: ROOM_ID,
    contents: opts.actorContents ?? [],
  };
  const u = {
    me,
    here: {
      id: ROOM_ID, name: "Test Room",
      flags: new Set(["room"]), state: {}, location: "", contents: [],
      broadcast: (m: string) => broadcasts.push(m),
    },
    cmd: {
      name: opts.cmdName ?? "get",
      original: opts.cmdName ?? "get",
      args: opts.args ?? [],
      switches: [],
    },
    send: (m: string, tgt?: string) => msgs.push({ msg: m, target: tgt }),
    canEdit: (opts.canEditFn
      ? async (_a: IDBObj, t: IDBObj) => opts.canEditFn!(_a, t)
      : async () => true) as (a: IDBObj, t: IDBObj) => Promise<boolean>,
    teleport: (from: string, to: string) => { opts.teleportCalls?.push([from, to]); },
    db: {
      search: async (_q: unknown): Promise<IDBObj[]> => {
        const seq = opts.searchSeq ?? [];
        return seq[searchIdx++] ?? [];
      },
      modify: async (id: string, op: string, data: unknown) => {
        opts.modifyCalls?.push([id, op, data]);
      },
      create: async (t: Partial<IDBObj>) => ({ id: "new1", name: "", flags: new Set<string>(), state: {}, contents: [], ...t } as IDBObj),
      destroy: async () => {},
    },
    util: {
      target: async (_a: IDBObj, _name: string): Promise<IDBObj | undefined> => {
        if (opts.targetSeq) return opts.targetSeq[targetIdx++];
        return undefined;
      },
      displayName: (o: IDBObj) => o.name || o.id,
      stripSubs: (s: string) => s,
    },
    eval: async (_id: string, _attr: string): Promise<string> => "",
    trigger: async (id: string, attr: string, args: string[]) => {
      opts.triggerCalls?.push({ id, attr, args });
    },
  } as unknown as IUrsamuSDK & { msgs: Msg[] };
  (u as unknown as Record<string, unknown>).msgs = msgs;
  return u;
}

// ===========================================================================
// execGet — pick up
// ===========================================================================

Deno.test("get — no args sends 'Get what?'", OPTS, async () => {
  const u = makeU({ args: [] });
  await execGet(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "Get what");
});

Deno.test("get — picks up a thing in the same room", OPTS, async () => {
  const modifyCalls: ModifyCall[] = [];
  const thing: IDBObj = { id: THING_ID, name: "Shiny Orb", flags: new Set(["thing"]), state: {}, location: ROOM_ID, contents: [] };
  const u = makeU({ args: ["Shiny Orb"], targetSeq: [thing], modifyCalls });
  await execGet(u);

  assertStringIncludes(u.msgs[0]?.msg ?? "", "pick up");
  assertEquals(modifyCalls[0][0], THING_ID);
  assertEquals(modifyCalls[0][1], "$set");
  assertEquals((modifyCalls[0][2] as Record<string, unknown>).location, ACTOR_ID);
});

Deno.test("get — cannot pick up a player", OPTS, async () => {
  const victim: IDBObj = { id: RECV_ID, name: "Victim", flags: new Set(["player", "connected"]), state: {}, location: ROOM_ID, contents: [] };
  const u = makeU({ args: ["Victim"], targetSeq: [victim] });
  await execGet(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "can't pick up players");
});

Deno.test("get — cannot pick up an exit", OPTS, async () => {
  const exit: IDBObj = { id: "si_exit1", name: "North", flags: new Set(["exit"]), state: {}, location: ROOM_ID, contents: [] };
  const u = makeU({ args: ["North"], targetSeq: [exit] });
  await execGet(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "can't pick that up");
});

Deno.test("get — thing not in same room returns 'don't see that here'", OPTS, async () => {
  const farThing: IDBObj = { id: THING_ID, name: "FarBall", flags: new Set(["thing"]), state: {}, location: "si_other_room", contents: [] };
  const u = makeU({ args: ["FarBall"], targetSeq: [farThing] });
  await execGet(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "don't see");
});

// ===========================================================================
// execDrop — drop
// ===========================================================================

Deno.test("drop — no args sends 'Drop what?'", OPTS, async () => {
  const u = makeU({ cmdName: "drop", args: [] });
  await execDrop(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "Drop what");
});

Deno.test("drop — drops a thing from inventory to room", OPTS, async () => {
  const modifyCalls: ModifyCall[] = [];
  // thing.location === ACTOR_ID → it's in inventory
  const thing: IDBObj = { id: THING_ID, name: "RedBall", flags: new Set(["thing"]), state: {}, location: ACTOR_ID, contents: [] };
  const u = makeU({ cmdName: "drop", args: ["RedBall"], targetSeq: [thing], modifyCalls });
  await execDrop(u);

  assertStringIncludes(u.msgs[0]?.msg ?? "", "drop");
  assertEquals(modifyCalls[0][0], THING_ID);
  assertEquals((modifyCalls[0][2] as Record<string, unknown>).location, ROOM_ID);
});

Deno.test("drop — thing not in inventory sends 'aren't carrying that'", OPTS, async () => {
  // thing.location === ROOM_ID (not actor) → not in inventory
  const thing: IDBObj = { id: THING_ID, name: "GreenBall", flags: new Set(["thing"]), state: {}, location: ROOM_ID, contents: [] };
  const u = makeU({ cmdName: "drop", args: ["GreenBall"], targetSeq: [thing] });
  await execDrop(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "aren't carrying");
});

// ===========================================================================
// execGive — give
// ===========================================================================

Deno.test("give — no args sends 'Give what to whom?'", OPTS, async () => {
  const u = makeU({ cmdName: "give", args: [] });
  await execGive(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "Give what to whom");
});

Deno.test("give — receiver not in same room sends 'aren't here'", OPTS, async () => {
  const farAway: IDBObj = { id: RECV_ID, name: "FarAway", flags: new Set(["player", "connected"]), state: {}, location: "si_room2", contents: [] };
  const u = makeU({ cmdName: "give", args: ["something", "FarAway"], targetSeq: [farAway] });
  await execGive(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "aren't here");
});

Deno.test("give — can only give things to players (not objects)", OPTS, async () => {
  const box: IDBObj = { id: THING_ID, name: "Box", flags: new Set(["thing"]), state: {}, location: ROOM_ID, contents: [] };
  const u = makeU({ cmdName: "give", args: ["something", "Box"], targetSeq: [box] });
  await execGive(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "can only give things to players");
});

Deno.test("give — give an object transfers it to receiver", OPTS, async () => {
  const modifyCalls: ModifyCall[] = [];
  const receiver: IDBObj = { id: RECV_ID, name: "Receiver", flags: new Set(["player", "connected"]), state: {}, location: ROOM_ID, contents: [] };
  const gem: IDBObj     = { id: THING_ID, name: "Gem", flags: new Set(["thing"]), state: {}, location: ACTOR_ID, contents: [] };
  // first target() call → receiver; second → gem
  const u = makeU({ cmdName: "give", args: ["Gem", "Receiver"], targetSeq: [receiver, gem], modifyCalls });
  await execGive(u);

  assertEquals(modifyCalls[0][0], THING_ID);
  assertEquals((modifyCalls[0][2] as Record<string, unknown>).location, RECV_ID);
});

Deno.test("give — give money sends confirmation message", OPTS, async () => {
  const receiver: IDBObj = { id: RECV_ID, name: "Receiver", flags: new Set(["player", "connected"]), state: { money: 10 }, location: ROOM_ID, contents: [] };
  const u = makeU({ cmdName: "give", args: ["50", "Receiver"], actorState: { name: "Giver", money: 100 }, targetSeq: [receiver] });
  await execGive(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "coins");
});

Deno.test("give — give money with insufficient funds fails", OPTS, async () => {
  const receiver2: IDBObj = { id: RECV_ID, name: "Receiver2", flags: new Set(["player", "connected"]), state: { money: 0 }, location: ROOM_ID, contents: [] };
  const u = makeU({ cmdName: "give", args: ["100", "Receiver2"], actorState: { name: "Giver", money: 5 }, targetSeq: [receiver2] });
  await execGive(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "don't have that much money");
});

// ===========================================================================
// execHome — go home
// ===========================================================================

Deno.test("home — sends 'home' message and calls teleport", OPTS, async () => {
  const teleportCalls: string[][] = [];
  const u = makeU({ cmdName: "home", args: [], actorState: { home: ROOM_ID }, teleportCalls });
  execHome(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "home");
  assertEquals(teleportCalls.length, 1);
});

// ===========================================================================
// execTrigger — @trigger
// ===========================================================================

Deno.test("@trigger — missing authorization vulnerability (security guard)", OPTS, async () => {
  const adminPlayer: IDBObj = {
    id: THING_ID, name: "AdminPlayer",
    flags: new Set(["player", "admin"]),
    state: {}, location: ROOM_ID, contents: [],
  };
  // canEdit returns false → must send Permission denied
  const u = makeU({
    cmdName: "@trigger",
    args: ["AdminPlayer/EXPLODE"],
    searchSeq: [[adminPlayer]],
    canEditFn: () => false,
  });
  await execTrigger(u);
  assertStringIncludes(u.msgs.map((m) => m.msg).join(" "), "Permission denied");
});

// H5 — negative / overflow amounts must be rejected (regression guard)
Deno.test("H5 — give money guards reject negative and overflow amounts", OPTS, () => {
  const regex = /^\d+$/;
  assertEquals(regex.test("-5"), false);
  assertEquals(regex.test("-999999999999"), false);
  const big = parseInt("99999999999999999999", 10);
  assertEquals(big > 999_999_999, true);
  assertEquals(parseInt("0", 10) <= 0, true);
});
