/**
 * tests/softcode_evaluator.test.ts
 *
 * Unit tests for the MUX softcode evaluator core.
 * Tests cover: literal text, substitutions, function calls, recursion
 * limits, timeouts, and basic control flow.
 *
 * These tests run entirely in-process — no Deno Worker is spawned.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { parse }    from "../src/services/Softcode/parser.ts";
import { evaluate } from "../src/services/Softcode/evaluator.ts";
import { isTooDeep } from "../src/services/Softcode/context.ts";
import type { EvalContext, DbAccessor, OutputAccessor } from "../src/services/Softcode/context.ts";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";
// Import stdlib so functions get registered
import "../src/services/Softcode/stdlib/index.ts";

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
    queryById:          async () => null,
    queryByName:        async () => null,
    lcon:               async () => [],
    lwho:               async () => [],
    lattr:              async () => [],
    getAttribute:       async () => null,
    getTagById:         async () => null,
    getPlayerTagById:   async () => null,
    ...overrides,
  };
}

const noOutput: OutputAccessor = {
  send:          () => {},
  roomBroadcast: () => {},
  broadcast:     () => {},
};

function makeCtx(overrides: Partial<EvalContext> = {}): EvalContext {
  const actor = makeActor();
  return {
    actor,
    executor:  actor,
    caller:    null,
    args:      [],
    registers: new Map(),
    iterStack: [],
    depth:     0,
    deadline:  Date.now() + 1000,
    db:        makeDb(),
    output:    noOutput,
    ...overrides,
  };
}

async function run(code: string, overrides: Partial<EvalContext> = {}): Promise<string> {
  const ast = parse(code, { startRule: "Start" });
  return evaluate(ast as Parameters<typeof evaluate>[0], makeCtx(overrides));
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
  const result = await run("%0", { args: ["hello"] });
  assertEquals(result, "hello");
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
  const ast = parse("%q0", { startRule: "Start" });
  assertEquals(await evaluate(ast as Parameters<typeof evaluate>[0], ctx), "myvalue");
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
  // Set %q0=outer, then localize sets it to inner, outer should be restored
  const result = await run("[setq(0,outer)][localize([setq(0,inner)])][r(0)]");
  assertEquals(result, "outer");
});

// ── iter ──────────────────────────────────────────────────────────────────

Deno.test("evaluator — iter over list", async () => {
  assertEquals(await run("[iter(a b c,##)]"), "a b c");
});

Deno.test("evaluator — iter #@ gives position", async () => {
  assertEquals(await run("[iter(a b,#@)]"), "1 2");
});

// ── depth guard ───────────────────────────────────────────────────────────
// Depth limit only applies inside callAttr() (u() / ulocal()) — plain
// function calls are not depth-gated. Verify the guard exists on the context.

Deno.test("evaluator — isTooDeep helper returns true at depth 20", () => {
  const ctx = makeCtx({ depth: 20 });
  assertEquals(isTooDeep(ctx), true);
  assertEquals(isTooDeep(makeCtx({ depth: 19 })), false);
});

// ── timeout guard ─────────────────────────────────────────────────────────

Deno.test("evaluator — past deadline returns timeout string", async () => {
  const ctx = makeCtx({ deadline: Date.now() - 1 });
  const ast = parse("hello", { startRule: "Start" });
  const result = await evaluate(ast as Parameters<typeof evaluate>[0], ctx);
  assertStringIncludes(result, "#-1 TIMEOUT");
});
