/**
 * tests/softcode_layout.test.ts
 *
 * Tests for header() / divider() / footer() softcode layout helpers.
 * Exercises them through the real UrsaMU softcode engine.
 */
import { assertEquals } from "@std/assert";
import { runSoftcode, softcodeEngine } from "../src/services/Softcode/ursamu-engine.ts";
import type { UrsaEvalContext } from "../src/services/Softcode/ursamu-context.ts";
import type { DbAccessor, OutputAccessor } from "../src/services/Softcode/context.ts";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";

function makeActor(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "1",
    name: "Tester",
    flags: new Set(["player", "connected"]),
    location: "0",
    state: {},
    contents: [],
    ...overrides,
  };
}

function makeDb(overrides: Partial<DbAccessor> = {}): DbAccessor {
  return {
    queryById:        () => Promise.resolve(null),
    queryByName:      () => Promise.resolve(null),
    lcon:             () => Promise.resolve([]),
    lwho:             () => Promise.resolve([]),
    lattr:            () => Promise.resolve([]),
    getAttribute:     () => Promise.resolve(null),
    getTagById:       () => Promise.resolve(null),
    getPlayerTagById: () => Promise.resolve(null),
    lsearch:          () => Promise.resolve([]),
    children:         () => Promise.resolve([]),
    lchannels:        () => Promise.resolve(""),
    channelsFor:      () => Promise.resolve(""),
    mailCount:        () => Promise.resolve(0),
    queueLength:      () => Promise.resolve(0),
    getIdleSecs:      () => Promise.resolve(0),
    getUserFn:        () => Promise.resolve(null),
    ...overrides,
  };
}

const noOutput: OutputAccessor = {
  send:          () => {},
  roomBroadcast: () => {},
  broadcast:     () => {},
};

function makeCtx(overrides: Partial<UrsaEvalContext> = {}): UrsaEvalContext {
  const actor = makeActor();
  return {
    enactor:      actor.id,
    executor:     actor,
    caller:       null,
    actor,
    args:         [],
    registers:    new Map(),
    iterStack:    [],
    depth:        0,
    maxDepth:     50,
    maxOutputLen: 65_536,
    deadline:     Date.now() + 5000,
    db:           makeDb(),
    output:       noOutput,
    _engine:      softcodeEngine,
    ...overrides,
  };
}

const run = (code: string) => runSoftcode(code, makeCtx());

// ── header ─────────────────────────────────────────────────────────────────

Deno.test("header — default width 78 and fill '='", async () => {
  const r = await run("[header(The Void)]");
  assertEquals(r.length, 78);
  assertEquals(r.startsWith("===== The Void "), true);
  assertEquals(r.endsWith("="), true);
});

Deno.test("header — custom width and fill", async () => {
  const r = await run("[header(Players,40,*)]");
  assertEquals(r.length, 40);
  assertEquals(r.startsWith("***** Players "), true);
  assertEquals(r.endsWith("*"), true);
});

Deno.test("header — empty title becomes fill x width", async () => {
  const r = await run("[header(,20,=)]");
  assertEquals(r, "=".repeat(20));
});

// ── divider ────────────────────────────────────────────────────────────────

Deno.test("divider — default fill '-'", async () => {
  const r = await run("[divider(Players)]");
  assertEquals(r.length, 78);
  assertEquals(r.startsWith("----- Players "), true);
  assertEquals(r.endsWith("-"), true);
});

// ── footer ─────────────────────────────────────────────────────────────────

Deno.test("footer — default 78 chars of '='", async () => {
  const r = await run("[footer()]");
  assertEquals(r, "=".repeat(78));
});

Deno.test("footer — custom width and fill", async () => {
  const r = await run("[footer(10,-)]");
  assertEquals(r, "-".repeat(10));
});

// ── composition via iter() ─────────────────────────────────────────────────

Deno.test("header — composes inside iter()", async () => {
  // iter joins each iteration's output with osep (default " "). With two
  // items of width 20, total length should be 20 + 1 + 20 = 41.
  const r = await run("[iter(a b,[header(##,20,=)])]");
  assertEquals(r.length, 41);
  assertEquals(r.slice(0, 20).startsWith("===== a "), true);
  assertEquals(r.slice(21, 41).startsWith("===== b "), true);
  assertEquals(r[20], " ");
});
