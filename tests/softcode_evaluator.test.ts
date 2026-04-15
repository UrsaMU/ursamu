/**
 * tests/softcode_evaluator.test.ts
 *
 * Unit tests for the UrsaMU softcode evaluator core (post-EvalEngine migration).
 * Tests cover: literal text, substitutions, function calls, recursion
 * limits, and basic control flow.
 *
 * These tests run entirely in-process via runSoftcode() — no Deno Worker is spawned.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { runSoftcode, softcodeEngine } from "../src/services/Softcode/ursamu-engine.ts";
import { isTooDeep, isTimedOut } from "../src/services/Softcode/ursamu-context.ts";
import type { UrsaEvalContext } from "../src/services/Softcode/ursamu-context.ts";
import type { DbAccessor, OutputAccessor } from "../src/services/Softcode/context.ts";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";

// ── Test helpers ──────────────────────────────────────────────────────────

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
    queryById:          () => Promise.resolve(null),
    queryByName:        () => Promise.resolve(null),
    lcon:               () => Promise.resolve([]),
    lwho:               () => Promise.resolve([]),
    lattr:              () => Promise.resolve([]),
    getAttribute:       () => Promise.resolve(null),
    getTagById:         () => Promise.resolve(null),
    getPlayerTagById:   () => Promise.resolve(null),
    lsearch:            () => Promise.resolve([]),
    children:           () => Promise.resolve([]),
    lchannels:          () => Promise.resolve(""),
    channelsFor:        () => Promise.resolve(""),
    mailCount:          () => Promise.resolve(0),
    queueLength:        () => Promise.resolve(0),
    getIdleSecs:        () => Promise.resolve(0),
    getUserFn:          () => Promise.resolve(null),
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

function run(code: string, overrides: Partial<UrsaEvalContext> = {}): Promise<string> {
  return runSoftcode(code, makeCtx(overrides));
}

// ── Literal text ──────────────────────────────────────────────────────────

Deno.test("evaluator — literal text passes through unchanged", async () => {
  assertEquals(await run("hello world"), "hello world");
});

Deno.test("evaluator — empty string returns empty", async () => {
  assertEquals(await run(""), "");
});

// ── Substitutions ─────────────────────────────────────────────────────────

Deno.test("evaluator — %# returns actor dbref", async () => {
  assertEquals(await run("%#"), "#1");
});

Deno.test("evaluator — %N returns actor name", async () => {
  assertEquals(await run("%N"), "Tester");
});

Deno.test("evaluator — %! returns executor dbref", async () => {
  assertEquals(await run("%!"), "#1");
});

Deno.test("evaluator — %0 returns first positional arg", async () => {
  assertEquals(await run("%0", { args: ["hello"] }), "hello");
});

Deno.test("evaluator — %0 returns empty when no args", async () => {
  assertEquals(await run("%0"), "");
});

Deno.test("evaluator — %r produces newline", async () => {
  assertStringIncludes(await run("a%rb"), "\n");
});

Deno.test("evaluator — %t produces tab", async () => {
  assertStringIncludes(await run("a%tb"), "\t");
});

Deno.test("evaluator — %% produces literal percent", async () => {
  assertEquals(await run("100%%"), "100%");
});

Deno.test("evaluator — %b produces space", async () => {
  assertEquals(await run("a%bb"), "a b");
});

// ── Register substitutions ────────────────────────────────────────────────

Deno.test("evaluator — %q0 reads from register", async () => {
  const ctx = makeCtx();
  ctx.registers.set("0", "myvalue");
  assertEquals(await runSoftcode("%q0", ctx), "myvalue");
});

// ── Function calls ────────────────────────────────────────────────────────

Deno.test("evaluator — [add(1,2)] returns 3", async () => {
  assertEquals(await run("[add(1,2)]"), "3");
});

Deno.test("evaluator — [mul(3,4)] returns 12", async () => {
  assertEquals(await run("[mul(3,4)]"), "12");
});

Deno.test("evaluator — [strlen(hello)] returns 5", async () => {
  assertEquals(await run("[strlen(hello)]"), "5");
});

Deno.test("evaluator — [upcase(hello)] returns HELLO", async () => {
  assertEquals(await run("[upcase(hello)]"), "HELLO");
});

Deno.test("evaluator — nested functions: [strlen([upcase(hi)])]", async () => {
  assertEquals(await run("[strlen([upcase(hi)])]"), "2");
});

Deno.test("evaluator — [if(1,yes,no)] returns yes", async () => {
  assertEquals(await run("[if(1,yes,no)]"), "yes");
});

Deno.test("evaluator — [ifelse(0,yes,no)] returns no", async () => {
  assertEquals(await run("[ifelse(0,yes,no)]"), "no");
});

Deno.test("evaluator — [not(0)] returns 1", async () => {
  assertEquals(await run("[not(0)]"), "1");
});

Deno.test("evaluator — unknown function returns #-1 error", async () => {
  assertStringIncludes(await run("[nonexistent_xyz123()]"), "#-1");
});

// ── setq / r registers ────────────────────────────────────────────────────

Deno.test("evaluator — setq then r retrieves value", async () => {
  assertEquals(await run("[setq(0,hello)][r(0)]"), "hello");
});

Deno.test("evaluator — setr returns the value", async () => {
  assertEquals(await run("[setr(0,world)]"), "world");
});

Deno.test("evaluator — setq multi-register", async () => {
  assertEquals(await run("[setq(0,a,1,b)][r(0)][r(1)]"), "ab");
});

// ── localize ──────────────────────────────────────────────────────────────

Deno.test("evaluator — localize isolates register changes", async () => {
  assertEquals(await run("[setq(0,outer)][localize([setq(0,inner)])][r(0)]"), "outer");
});

// ── iter ──────────────────────────────────────────────────────────────────

Deno.test("evaluator — iter over list", async () => {
  assertEquals(await run("[iter(a b c,##)]"), "a b c");
});

Deno.test("evaluator — iter #@ gives position", async () => {
  assertEquals(await run("[iter(a b,#@)]"), "1 2");
});

// ── depth guard ───────────────────────────────────────────────────────────

Deno.test("evaluator — isTooDeep helper returns true at maxDepth", () => {
  const ctx = makeCtx({ depth: 50 });
  assertEquals(isTooDeep(ctx), true);
  assertEquals(isTooDeep(makeCtx({ depth: 49 })), false);
});

// ── deadline helpers (used by legacy stdlib) ──────────────────────────────

Deno.test("evaluator — isTimedOut helper detects past deadline", () => {
  assertEquals(isTimedOut(makeCtx({ deadline: Date.now() - 1 })), true);
  assertEquals(isTimedOut(makeCtx({ deadline: Date.now() + 10_000 })), false);
});

// ── engine depth limit ────────────────────────────────────────────────────

Deno.test("evaluator — engine returns depth-exceeded when depth > maxDepth", async () => {
  // depth starts at 1, maxDepth = 0 → immediately exceeds limit
  const result = await run("[add(1,2)]", { depth: 1, maxDepth: 0 });
  assertStringIncludes(result, "#-1");
});
