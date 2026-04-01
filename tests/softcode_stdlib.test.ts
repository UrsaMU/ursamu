/**
 * tests/softcode_stdlib.test.ts
 *
 * Unit tests for the MUX softcode standard library functions.
 * Covers: math, string, list, logic, register, and object functions.
 */
import { assertEquals, assertStringIncludes, assertMatch } from "@std/assert";
import { parse }    from "../src/services/Softcode/parser.ts";
import { evaluate } from "../src/services/Softcode/evaluator.ts";
import type { EvalContext, DbAccessor, OutputAccessor } from "../src/services/Softcode/context.ts";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";
import "../src/services/Softcode/stdlib/index.ts";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeObj(id: string, name: string, flags: string[]): IDBObj {
  return { id, name, flags: new Set(flags), location: "0", state: {}, contents: [] };
}

function actor(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "100",
    name: "Alice",
    flags: new Set(["player", "connected"]),
    location: "200",
    state: {},
    contents: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<EvalContext> = {}): EvalContext {
  const a = actor();
  return {
    actor:     a,
    executor:  a,
    caller:    null,
    args:      [],
    registers: new Map(),
    iterStack: [],
    depth:     0,
    deadline:  Date.now() + 2000,
    db: {
      queryById:        async (id) => id === "100" ? a : null,
      queryByName:      async (name) => name.toLowerCase() === "alice" ? a : null,
      lcon:             async () => [],
      lwho:             async () => [a],
      lattr:            async () => [],
      getAttribute:     async () => null,
      getTagById:       async () => null,
      getPlayerTagById: async () => null,
    } satisfies DbAccessor,
    output: { send: () => {}, roomBroadcast: () => {}, broadcast: () => {} },
    ...overrides,
  };
}

async function fn(code: string, ctx?: Partial<EvalContext>): Promise<string> {
  const ast = parse(code, { startRule: "Start" });
  return evaluate(ast as Parameters<typeof evaluate>[0], makeCtx(ctx));
}

// ── Math ──────────────────────────────────────────────────────────────────

Deno.test("stdlib/math — add", async () => assertEquals(await fn("[add(3,4)]"), "7"));
Deno.test("stdlib/math — sub", async () => assertEquals(await fn("[sub(10,3)]"), "7"));
Deno.test("stdlib/math — mul", async () => assertEquals(await fn("[mul(3,4)]"), "12"));
Deno.test("stdlib/math — div", async () => assertEquals(await fn("[div(10,4)]"), "2.5"));
Deno.test("stdlib/math — mod", async () => assertEquals(await fn("[mod(10,3)]"), "1"));
Deno.test("stdlib/math — abs(-5)", async () => assertEquals(await fn("[abs(-5)]"), "5"));
Deno.test("stdlib/math — floor(3.9)", async () => assertEquals(await fn("[floor(3.9)]"), "3"));
Deno.test("stdlib/math — ceil(3.1)", async () => assertEquals(await fn("[ceil(3.1)]"), "4"));
Deno.test("stdlib/math — round(3.5)", async () => assertEquals(await fn("[round(3.5)]"), "4"));
Deno.test("stdlib/math — max(1,5,3)", async () => assertEquals(await fn("[max(1,5,3)]"), "5"));
Deno.test("stdlib/math — min(1,5,3)", async () => assertEquals(await fn("[min(1,5,3)]"), "1"));
Deno.test("stdlib/math — power(2,8)", async () => assertEquals(await fn("[power(2,8)]"), "256"));
Deno.test("stdlib/math — sqrt(9)", async () => assertEquals(await fn("[sqrt(9)]"), "3"));
Deno.test("stdlib/math — isnum(42)", async () => assertEquals(await fn("[isnum(42)]"), "1"));
Deno.test("stdlib/math — isnum(abc)", async () => assertEquals(await fn("[isnum(abc)]"), "0"));
Deno.test("stdlib/math — eq(5,5)", async () => assertEquals(await fn("[eq(5,5)]"), "1"));
Deno.test("stdlib/math — gt(5,3)", async () => assertEquals(await fn("[gt(5,3)]"), "1"));
Deno.test("stdlib/math — lt(3,5)", async () => assertEquals(await fn("[lt(3,5)]"), "1"));

// ── String ────────────────────────────────────────────────────────────────

Deno.test("stdlib/string — strlen", async () => assertEquals(await fn("[strlen(hello)]"), "5"));
Deno.test("stdlib/string — upcase", async () => assertEquals(await fn("[upcase(hello)]"), "HELLO"));
Deno.test("stdlib/string — lowcase", async () => assertEquals(await fn("[lowcase(HELLO)]"), "hello"));
Deno.test("stdlib/string — capstr", async () => assertEquals(await fn("[capstr(hello world)]"), "Hello world"));
Deno.test("stdlib/string — trim", async () => assertEquals(await fn("[trim(  hi  )]"), "hi"));
Deno.test("stdlib/string — left", async () => assertEquals(await fn("[left(hello,3)]"), "hel"));
Deno.test("stdlib/string — right", async () => assertEquals(await fn("[right(hello,3)]"), "llo"));
Deno.test("stdlib/string — mid", async () => assertEquals(await fn("[mid(hello,1,3)]"), "ell"));
Deno.test("stdlib/string — reverse", async () => assertEquals(await fn("[reverse(hello)]"), "olleh"));
Deno.test("stdlib/string — space(5)", async () => assertEquals(await fn("[space(5)]"), "     "));
Deno.test("stdlib/string — repeat(ab,3)", async () => assertEquals(await fn("[repeat(ab,3)]"), "ababab"));
Deno.test("stdlib/string — before(hello,l)", async () => assertEquals(await fn("[before(hello,l)]"), "he"));
Deno.test("stdlib/string — after(hello,l)", async () => assertEquals(await fn("[after(hello,l)]"), "lo"));
Deno.test("stdlib/string — chr(65)", async () => assertEquals(await fn("[chr(65)]"), "A"));
Deno.test("stdlib/string — ord(A)", async () => assertEquals(await fn("[ord(A)]"), "65"));
Deno.test("stdlib/string — ljust pads right", async () => assertEquals(await fn("[ljust(hi,5)]"), "hi   "));
Deno.test("stdlib/string — rjust pads left", async () => assertEquals(await fn("[rjust(hi,5)]"), "   hi"));
Deno.test("stdlib/string — center pads both", async () => assertEquals(await fn("[center(hi,6)]"), "  hi  "));
Deno.test("stdlib/string — index finds position", async () => assertEquals(await fn("[index(hello,l,1)]"), "3"));
Deno.test("stdlib/string — strmatch exact", async () => assertEquals(await fn("[strmatch(hello,hello)]"), "1"));
Deno.test("stdlib/string — strmatch wildcard", async () => assertEquals(await fn("[strmatch(hello,hel*)]"), "1"));
Deno.test("stdlib/string — cat", async () => assertEquals(await fn("[cat(a,b,c)]"), "a b c"));
Deno.test("stdlib/string — squish", async () => assertEquals(await fn("[squish(  a  b  )]"), "a b"));

// ── List ──────────────────────────────────────────────────────────────────

Deno.test("stdlib/list — words", async () => assertEquals(await fn("[words(a b c)]"), "3"));
Deno.test("stdlib/list — word(list,2)", async () => assertEquals(await fn("[word(a b c,2)]"), "b"));
Deno.test("stdlib/list — first", async () => assertEquals(await fn("[first(a b c)]"), "a"));
Deno.test("stdlib/list — last", async () => assertEquals(await fn("[last(a b c)]"), "c"));
Deno.test("stdlib/list — rest", async () => assertEquals(await fn("[rest(a b c)]"), "b c"));
Deno.test("stdlib/list — member", async () => assertEquals(await fn("[member(a b c,b)]"), "2"));
Deno.test("stdlib/list — member missing", async () => assertEquals(await fn("[member(a b c,z)]"), "0"));
Deno.test("stdlib/list — ldelete", async () => assertEquals(await fn("[ldelete(a b c,2)]"), "a c"));
Deno.test("stdlib/list — insert", async () => assertEquals(await fn("[insert(a c,2,b)]"), "a b c"));
Deno.test("stdlib/list — setunion", async () => assertEquals(await fn("[setunion(a b,b c)]"), "a b c"));
Deno.test("stdlib/list — setinter", async () => assertEquals(await fn("[setinter(a b c,b c d)]"), "b c"));
Deno.test("stdlib/list — setdiff", async () => assertEquals(await fn("[setdiff(a b c,b)]"), "a c"));
Deno.test("stdlib/list — sort alpha", async () => assertEquals(await fn("[sort(c a b)]"), "a b c"));
Deno.test("stdlib/list — sort numeric", async () => assertEquals(await fn("[sort(10 2 1,n)]"), "1 2 10"));
Deno.test("stdlib/list — extract", async () => assertEquals(await fn("[extract(a b c d,2,2)]"), "b c"));
Deno.test("stdlib/list — lnum", async () => assertEquals(await fn("[lnum(3)]"), "0 1 2"));
Deno.test("stdlib/list — grab", async () => assertEquals(await fn("[grab(apple banana cherry,ban*)]"), "banana"));
Deno.test("stdlib/list — graball", async () => assertEquals(await fn("[graball(apple banana cherry,*an*)]"), "banana"));
Deno.test("stdlib/list — revwords", async () => assertEquals(await fn("[revwords(a b c)]"), "c b a"));

// ── Logic ─────────────────────────────────────────────────────────────────

Deno.test("stdlib/logic — t(1)", async () => assertEquals(await fn("[t(1)]"), "1"));
Deno.test("stdlib/logic — t(0)", async () => assertEquals(await fn("[t(0)]"), "0"));
Deno.test("stdlib/logic — t(nonzero)", async () => assertEquals(await fn("[t(5)]"), "1"));
Deno.test("stdlib/logic — not(1)", async () => assertEquals(await fn("[not(1)]"), "0"));
Deno.test("stdlib/logic — and(1,1)", async () => assertEquals(await fn("[and(1,1)]"), "1"));
Deno.test("stdlib/logic — and(1,0)", async () => assertEquals(await fn("[and(1,0)]"), "0"));
Deno.test("stdlib/logic — or(0,1)", async () => assertEquals(await fn("[or(0,1)]"), "1"));
Deno.test("stdlib/logic — xor(1,0)", async () => assertEquals(await fn("[xor(1,0)]"), "1"));
Deno.test("stdlib/logic — xor(1,1)", async () => assertEquals(await fn("[xor(1,1)]"), "0"));
Deno.test("stdlib/logic — if(1,yes)", async () => assertEquals(await fn("[if(1,yes)]"), "yes"));
Deno.test("stdlib/logic — ifelse(0,yes,no)", async () => assertEquals(await fn("[ifelse(0,yes,no)]"), "no"));
Deno.test("stdlib/logic — switch matches wildcard", async () => assertEquals(await fn("[switch(hello,hel*,matched,default)]"), "matched"));
Deno.test("stdlib/logic — switch default", async () => assertEquals(await fn("[switch(xyz,hel*,matched,default)]"), "default"));
Deno.test("stdlib/logic — case exact match", async () => assertEquals(await fn("[case(FOO,foo,yes,no)]"), "yes"));
Deno.test("stdlib/logic — null returns empty", async () => assertEquals(await fn("[null(anything)]"), ""));

// ── Object functions ──────────────────────────────────────────────────────

Deno.test("stdlib/object — name(me)", async () => assertEquals(await fn("[name(me)]"), "Alice"));
Deno.test("stdlib/object — dbref(me)", async () => assertEquals(await fn("[dbref(me)]"), "#100"));
Deno.test("stdlib/object — type(me) is PLAYER", async () => assertEquals(await fn("[type(me)]"), "PLAYER"));
Deno.test("stdlib/object — hastype(me,player)", async () => assertEquals(await fn("[hastype(me,player)]"), "1"));
Deno.test("stdlib/object — hasflag(me,player)", async () => assertEquals(await fn("[hasflag(me,player)]"), "1"));
Deno.test("stdlib/object — hasflag(me,wizard)", async () => assertEquals(await fn("[hasflag(me,wizard)]"), "0"));
Deno.test("stdlib/object — loc(me) returns room dbref", async () => {
  const result = await fn("[loc(me)]");
  assertEquals(result, "#200");
});
Deno.test("stdlib/object — conn returns 1 for connected actor", async () => {
  // actor has "connected" flag → conn() returns "1"
  assertEquals(await fn("[conn(me)]"), "1");
});

Deno.test("stdlib/object — conn returns 0 for non-connected obj", async () => {
  const disconnected = makeObj("200", "Room", ["room"]);
  const ctx = makeCtx({
    db: {
      queryById:        async (id) => id === "200" ? disconnected : null,
      queryByName:      async () => null,
      lcon:             async () => [],
      lwho:             async () => [],
      lattr:            async () => [],
      getAttribute:     async () => null,
      getTagById:       async () => null,
      getPlayerTagById: async () => null,
    },
  });
  assertEquals(await fn("[conn(here)]", ctx), "0");
});
