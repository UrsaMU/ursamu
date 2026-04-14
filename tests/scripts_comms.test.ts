// deno-lint-ignore-file require-await
/**
 * tests/scripts_comms.test.ts
 *
 * Tests for player communication, utility, and channel management:
 *   - execThink      (src/commands/comms.ts)
 *   - execScore      (src/commands/social.ts)
 *   - execSay        (src/commands/comms.ts)
 *   - execPose       (src/commands/comms.ts)
 *   - execWho        (src/commands/social.ts)
 *   - execChannel    (src/commands/channels.ts — join/leave/list)
 *   - execChancreate (src/commands/channels.ts)
 *   - execChandestroy(src/commands/channels.ts)
 *   - execChanset    (src/commands/channels.ts)
 */
import { assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import { execThink, execSay, execPose } from "../src/commands/comms.ts";
import { execWho, execScore } from "../src/commands/social.ts";
import { execChannel, execChancreate, execChandestroy, execChanset } from "../src/commands/channels.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "sc_actor1", name: "Tester",
    flags: new Set(["player", "connected"]),
    state: { name: "Tester" },
    location: "sc_room1", contents: [],
    ...overrides,
  };
}

function mockRoom(): { id: string; name: string; flags: Set<string>; state: Record<string, unknown>; location: string; contents: IDBObj[]; broadcast: (m: string) => void } & { _broadcasts: string[] } {
  const broadcasts: string[] = [];
  const room = {
    id: "sc_room1", name: "Test Room",
    flags: new Set(["room"]),
    state: {}, location: "", contents: [] as IDBObj[],
    broadcast: (m: string) => broadcasts.push(m),
    _broadcasts: broadcasts,
  };
  return room;
}

function makeU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  original?: string;
  cmdName?: string;
  dbSearch?: (q: unknown) => Promise<IDBObj[]>;
  chan?: Partial<{
    list: () => Promise<unknown>;
    join: (c: string, a: string) => Promise<void>;
    leave: (a: string) => Promise<void>;
    create: (n: string, o: unknown) => Promise<unknown>;
    destroy: (n: string) => Promise<unknown>;
    set: (n: string, o: unknown) => Promise<unknown>;
    history: (n: string, l: number) => Promise<unknown>;
  }>;
} = {}) {
  const sent: string[] = [];
  const me = mockPlayer(opts.me ?? {});
  const room = mockRoom();

  return Object.assign({
    me, here: room,
    cmd: {
      name: opts.cmdName ?? "test",
      original: opts.original ?? opts.cmdName ?? "test",
      args: opts.args ?? [""],
      switches: [],
    },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: () => Promise.resolve(true),
    db: {
      search: opts.dbSearch ?? (() => Promise.resolve([])),
      modify: () => Promise.resolve(),
      create: (d: unknown) => Promise.resolve(d as IDBObj),
      destroy: () => Promise.resolve(),
    },
    chan: {
      list:    opts.chan?.list    ?? (() => Promise.resolve([])),
      join:    opts.chan?.join    ?? (() => Promise.resolve()),
      leave:   opts.chan?.leave   ?? (() => Promise.resolve()),
      create:  opts.chan?.create  ?? (() => Promise.resolve({})),
      destroy: opts.chan?.destroy ?? (() => Promise.resolve({})),
      set:     opts.chan?.set     ?? (() => Promise.resolve({})),
      history: opts.chan?.history ?? (() => Promise.resolve([])),
    },
    util: {
      target:      () => Promise.resolve(null),
      displayName: (o: IDBObj) => (o.state?.name as string) || o.name || "Unknown",
      stripSubs:   (s: string) => s,
      center:      (s: string) => s,
    },
    evalString:  (s: string) => Promise.resolve(s),
    events: {
      emit: () => Promise.resolve(),
      on:   () => Promise.resolve(""),
      off:  () => Promise.resolve(),
    },
    trigger: () => Promise.resolve(),
  } as unknown as IUrsamuSDK, { _sent: sent, _room: room });
}

// ===========================================================================
// think
// ===========================================================================

Deno.test("think — no args sends 'What do you want to think?'", OPTS, async () => {
  const u = makeU({ args: [""] });
  await execThink(u);
  assertStringIncludes(u._sent.join(" "), "What do you want to think");
});

Deno.test("think — echoes message back to sender", OPTS, async () => {
  const u = makeU({ args: ["A deep thought."] });
  await execThink(u);
  assertStringIncludes(u._sent.join(" "), "A deep thought.");
});

// ===========================================================================
// score
// ===========================================================================

Deno.test("score — sends scorecard with player name", OPTS, async () => {
  const u = makeU({ me: { state: { name: "Scorer", money: 42 } } });
  execScore(u);
  assertStringIncludes(u._sent.join(" "), "Scorer");
  assertStringIncludes(u._sent.join(" "), "42");
});

Deno.test("score — shows zero money when not set", OPTS, async () => {
  const u = makeU({ me: { name: "Broke", state: { name: "Broke" } } });
  execScore(u);
  assertStringIncludes(u._sent.join(" "), "0");
});

// ===========================================================================
// say
// ===========================================================================

Deno.test("say — no args sends 'What do you want to say?'", OPTS, async () => {
  const u = makeU({ args: [""] });
  await execSay(u);
  assertStringIncludes(u._sent.join(" "), "What do you want to say");
});

Deno.test("say — broadcasts message to room with actor name", OPTS, async () => {
  const u = makeU({ me: { name: "Talker", state: { name: "Talker" } }, args: ["Hello, world!"] });
  await execSay(u);
  assertStringIncludes(u._room._broadcasts.join(" "), "Talker");
  assertStringIncludes(u._room._broadcasts.join(" "), "Hello, world!");
  assertStringIncludes(u._room._broadcasts.join(" "), "says");
});

Deno.test("say — uses moniker over name when set", OPTS, async () => {
  const u = makeU({
    me: { name: "Talker", state: { name: "Talker", moniker: "The Magnificent" } },
    args: ["Hi!"],
  });
  await execSay(u);
  assertStringIncludes(u._room._broadcasts.join(" "), "The Magnificent");
});

// ===========================================================================
// pose
// ===========================================================================

Deno.test("pose — no args sends 'Pose what?'", OPTS, async () => {
  const u = makeU({ args: [""] });
  await execPose(u);
  assertStringIncludes(u._sent.join(" "), "Pose what");
});

Deno.test("pose — broadcasts emote to room", OPTS, async () => {
  const u = makeU({
    me: { name: "Poser", state: { name: "Poser" } },
    args: ["stretches dramatically."],
  });
  await execPose(u);
  assertStringIncludes(u._room._broadcasts.join(" "), "Poser");
  assertStringIncludes(u._room._broadcasts.join(" "), "stretches dramatically.");
});

Deno.test("pose — semipose omits space between name and text", OPTS, async () => {
  const u = makeU({
    me: { name: "Poser", state: { name: "Poser" } },
    args: ["'s eyes glow."],
    cmdName: ";",
    original: ";'s eyes glow.",
  });
  await execPose(u);
  assertStringIncludes(u._room._broadcasts.join(" "), "Poser's eyes glow.");
});

// ===========================================================================
// who
// ===========================================================================

Deno.test("who — shows '0 players online' when DB is empty", OPTS, async () => {
  const u = makeU({ dbSearch: () => Promise.resolve([]) });
  await execWho(u);
  assertStringIncludes(u._sent.join(" "), "0");
  assertStringIncludes(u._sent.join(" "), "online");
});

Deno.test("who — lists connected players from search results", OPTS, async () => {
  const u = makeU({
    dbSearch: () => Promise.resolve([
      { id: "p1", name: "Alice", flags: new Set(["player", "connected"]), state: { name: "Alice", doing: "Being awesome" }, contents: [] },
      { id: "p2", name: "Bob",   flags: new Set(["player", "connected"]), state: { name: "Bob",   doing: "" }, contents: [] },
    ] as IDBObj[]),
  });
  await execWho(u);
  const out = u._sent.join(" ");
  assertStringIncludes(out, "Alice");
  assertStringIncludes(out, "Bob");
  assertStringIncludes(out, "2");
});

Deno.test("who — dark players are excluded", OPTS, async () => {
  const u = makeU({
    dbSearch: () => Promise.resolve([
      { id: "p1", name: "Visible", flags: new Set(["player", "connected"]),        state: { name: "Visible" }, contents: [] },
      { id: "p2", name: "Shadow",  flags: new Set(["player", "connected", "dark"]), state: { name: "Shadow"  }, contents: [] },
    ] as IDBObj[]),
  });
  await execWho(u);
  const out = u._sent.join(" ");
  assertStringIncludes(out, "Visible");
  assertStringIncludes(out, "1");
});

// ===========================================================================
// channels.ts — @channel/list, @channel/join, @channel/leave
// ===========================================================================

Deno.test("@channel/list — sends channel list header and footer", OPTS, async () => {
  const u = makeU({
    args: ["", ""],
    chan: { list: () => Promise.resolve([{ name: "public", alias: "pub" }]) },
  });
  await execChannel(u);
  const out = u._sent.join(" ");
  assertStringIncludes(out, "public");
  assertStringIncludes(out, "pub");
});

Deno.test("@channel/join — joins channel and sends confirmation", OPTS, async () => {
  const u = makeU({
    args: ["join", "public=pub"],
    chan: { join: async () => {} },
  });
  await execChannel(u);
  assertStringIncludes(u._sent.join(" "), "joined");
});

Deno.test("@channel/leave — leaves channel and sends confirmation", OPTS, async () => {
  const u = makeU({
    args: ["leave", "pub"],
    chan: { leave: () => Promise.resolve() },
  });
  await execChannel(u);
  assertStringIncludes(u._sent.join(" "), "left");
});

// ===========================================================================
// chancreate
// ===========================================================================

Deno.test("@chancreate — non-admin gets permission denied", OPTS, async () => {
  const u = makeU({ me: { flags: new Set(["player", "connected"]) }, args: ["", "public"] });
  await execChancreate(u);
  assertStringIncludes(u._sent.join(" "), "Permission denied");
});

Deno.test("@chancreate — no args sends usage", OPTS, async () => {
  const u = makeU({ me: { flags: new Set(["admin", "connected"]) }, args: ["", ""] });
  await execChancreate(u);
  assertStringIncludes(u._sent.join(" "), "Usage");
});

Deno.test("@chancreate — admin creates channel", OPTS, async () => {
  const u = makeU({
    me: { flags: new Set(["admin", "connected"]) },
    args: ["", "public=[PUB]"],
    chan: { create: (_n, _o) => Promise.resolve({ id: "public", name: "public", header: "[PUB]" }) },
  });
  await execChancreate(u);
  assertStringIncludes(u._sent.join(" "), "created");
  assertStringIncludes(u._sent.join(" "), "public");
});

Deno.test("@chancreate — wizard also has permission", OPTS, async () => {
  const u = makeU({
    me: { flags: new Set(["wizard", "connected"]) },
    args: ["", "staff"],
    chan: { create: (_n, _o) => Promise.resolve({ id: "staff", name: "staff", header: "[STAFF]" }) },
  });
  await execChancreate(u);
  assertStringIncludes(u._sent.join(" "), "created");
});

// ===========================================================================
// chandestroy
// ===========================================================================

Deno.test("@chandestroy — non-admin gets permission denied", OPTS, async () => {
  const u = makeU({ me: { flags: new Set(["player", "connected"]) }, args: ["public"] });
  await execChandestroy(u);
  assertStringIncludes(u._sent.join(" "), "Permission denied");
});

Deno.test("@chandestroy — no args sends usage", OPTS, async () => {
  const u = makeU({ me: { flags: new Set(["admin", "connected"]) }, args: [""] });
  await execChandestroy(u);
  assertStringIncludes(u._sent.join(" "), "Usage");
});

Deno.test("@chandestroy — propagates error from service", OPTS, async () => {
  const u = makeU({
    me: { flags: new Set(["admin", "connected"]) },
    args: ["nonexistent"],
    chan: { destroy: () => Promise.resolve({ error: "Channel not found." }) },
  });
  await execChandestroy(u);
  assertStringIncludes(u._sent.join(" "), "not found");
});

Deno.test("@chandestroy — admin destroys channel", OPTS, async () => {
  const u = makeU({
    me: { flags: new Set(["admin", "connected"]) },
    args: ["public"],
    chan: { destroy: () => Promise.resolve({ ok: true }) },
  });
  await execChandestroy(u);
  assertStringIncludes(u._sent.join(" "), "destroyed");
  assertStringIncludes(u._sent.join(" "), "public");
});

// ===========================================================================
// chanset
// ===========================================================================

Deno.test("@chanset — non-admin gets permission denied", OPTS, async () => {
  const u = makeU({ me: { flags: new Set(["player", "connected"]) }, args: ["public/header=[PUB]"] });
  await execChanset(u);
  assertStringIncludes(u._sent.join(" "), "Permission denied");
});

Deno.test("@chanset — bad format sends usage", OPTS, async () => {
  const u = makeU({ me: { flags: new Set(["admin", "connected"]) }, args: ["public"] });
  await execChanset(u);
  assertStringIncludes(u._sent.join(" "), "Usage");
});

Deno.test("@chanset — unknown property sends error", OPTS, async () => {
  const u = makeU({
    me: { flags: new Set(["admin", "connected"]) },
    args: ["public/color=red"],
    chan: {
      list:  () => Promise.resolve([]),  // no ownership conflict
      set:   () => Promise.resolve({ ok: true }),
    },
  });
  await execChanset(u);
  assertStringIncludes(u._sent.join(" "), "Unknown property");
});

Deno.test("@chanset — admin sets header", OPTS, async () => {
  const u = makeU({
    me: { flags: new Set(["admin", "connected"]) },
    args: ["public/header=[PUB]"],
    chan: {
      list: () => Promise.resolve([]),
      set:  () => Promise.resolve({ ok: true }),
    },
  });
  await execChanset(u);
  assertStringIncludes(u._sent.join(" "), "header");
  assertStringIncludes(u._sent.join(" "), "[PUB]");
});

Deno.test("@chanset — admin sets lock", OPTS, async () => {
  const u = makeU({
    me: { flags: new Set(["admin", "connected"]) },
    args: ["public/lock=player+"],
    chan: {
      list: () => Promise.resolve([]),
      set:  () => Promise.resolve({ ok: true }),
    },
  });
  await execChanset(u);
  assertStringIncludes(u._sent.join(" "), "lock");
  assertStringIncludes(u._sent.join(" "), "player+");
});

Deno.test("@chanset — admin sets hidden=on", OPTS, async () => {
  const u = makeU({
    me: { flags: new Set(["admin", "connected"]) },
    args: ["public/hidden=on"],
    chan: {
      list: () => Promise.resolve([]),
      set:  () => Promise.resolve({ ok: true }),
    },
  });
  await execChanset(u);
  assertStringIncludes(u._sent.join(" "), "hidden");
});

// ===========================================================================
// L1 — execWho must not show "NaN" for NaN lastCommand values
// ===========================================================================

Deno.test("L1 — who with NaN lastCommand shows '---' not 'NaN'", OPTS, async () => {
  const u = makeU({
    dbSearch: () => Promise.resolve([{
      id: "nan_player",
      name: "NanPlayer",
      flags: new Set(["player", "connected"]),
      state: { lastCommand: NaN, name: "NanPlayer" },
      location: "limbo",
      contents: [],
    } as IDBObj]),
  });
  await execWho(u);
  const output = u._sent.join(" ");
  if (output.includes("NaN")) {
    throw new Error(`L1 BUG: who output contains "NaN": ${output}`);
  }
});
