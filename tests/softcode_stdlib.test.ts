/**
 * tests/softcode_stdlib.test.ts
 *
 * Unit tests for the UrsaMU softcode standard library functions (post-EvalEngine migration).
 * Covers: math, string, list, logic, register, and object functions.
 */
// deno-lint-ignore-file require-await
import { assertEquals } from "@std/assert";
import { runSoftcode, softcodeEngine } from "../src/services/Softcode/ursamu-engine.ts";
import type { UrsaEvalContext } from "../src/services/Softcode/ursamu-context.ts";
import type { DbAccessor } from "../src/services/Softcode/context.ts";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";

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

function makeCtx(overrides: Partial<UrsaEvalContext> = {}): UrsaEvalContext {
  const a = actor();
  return {
    enactor:      a.id,
    executor:     a,
    caller:       null,
    actor:        a,
    args:         [],
    registers:    new Map(),
    iterStack:    [],
    depth:        0,
    maxDepth:     50,
    maxOutputLen: 65_536,
    deadline:     Date.now() + 2000,
    db: {
      queryById:        async (id) => id === "100" ? a : null,
      queryByName:      async (name) => name.toLowerCase() === "alice" ? a : null,
      lcon:             async () => [],
      lwho:             async () => [a],
      lattr:            async () => [],
      getAttribute:     async () => null,
      getTagById:       async () => null,
      getPlayerTagById: async () => null,
      lsearch:          async () => [],
      children:         async () => [],
      lchannels:        async () => "",
      channelsFor:      async () => "",
      mailCount:        async () => 0,
      queueLength:      async () => 0,
      getIdleSecs:      async () => 0,
      getUserFn:        async () => null,
    } satisfies DbAccessor,
    output:       { send: () => {}, roomBroadcast: () => {}, broadcast: () => {} },
    _engine:      softcodeEngine,
    ...overrides,
  };
}

function run(code: string, ctx?: Partial<UrsaEvalContext>): Promise<string> {
  return runSoftcode(code, makeCtx(ctx));
}

// ── Math ──────────────────────────────────────────────────────────────────

Deno.test("stdlib/math — add",       async () => assertEquals(await run("[add(3,4)]"),    "7"));
Deno.test("stdlib/math — sub",       async () => assertEquals(await run("[sub(10,3)]"),   "7"));
Deno.test("stdlib/math — mul",       async () => assertEquals(await run("[mul(3,4)]"),    "12"));
Deno.test("stdlib/math — div",       async () => assertEquals(await run("[div(10,4)]"),   "2"));   // integer division (classic MUSH)
Deno.test("stdlib/math — mod",       async () => assertEquals(await run("[mod(10,3)]"),   "1"));
Deno.test("stdlib/math — abs(-5)",   async () => assertEquals(await run("[abs(-5)]"),     "5"));
Deno.test("stdlib/math — floor(3.9)",async () => assertEquals(await run("[floor(3.9)]"),  "3"));
Deno.test("stdlib/math — ceil(3.1)", async () => assertEquals(await run("[ceil(3.1)]"),   "4"));
Deno.test("stdlib/math — round(3.5)",async () => assertEquals(await run("[round(3.5,0)]"), "4"));  // round requires decimal-places arg
Deno.test("stdlib/math — max(1,5,3)",async () => assertEquals(await run("[max(1,5,3)]"),  "5"));
Deno.test("stdlib/math — min(1,5,3)",async () => assertEquals(await run("[min(1,5,3)]"),  "1"));
Deno.test("stdlib/math — power(2,8)",async () => assertEquals(await run("[power(2,8)]"),  "256"));
Deno.test("stdlib/math — sqrt(9)",   async () => assertEquals(await run("[sqrt(9)]"),     "3"));
Deno.test("stdlib/math — isnum(42)", async () => assertEquals(await run("[isnum(42)]"),   "1"));
Deno.test("stdlib/math — isnum(abc)",async () => assertEquals(await run("[isnum(abc)]"),  "0"));
Deno.test("stdlib/math — eq(5,5)",   async () => assertEquals(await run("[eq(5,5)]"),     "1"));
Deno.test("stdlib/math — gt(5,3)",   async () => assertEquals(await run("[gt(5,3)]"),     "1"));
Deno.test("stdlib/math — lt(3,5)",   async () => assertEquals(await run("[lt(3,5)]"),     "1"));

// ── String ────────────────────────────────────────────────────────────────

Deno.test("stdlib/string — strlen",  async () => assertEquals(await run("[strlen(hello)]"),          "5"));
Deno.test("stdlib/string — upcase",  async () => assertEquals(await run("[upcase(hello)]"),          "HELLO"));
Deno.test("stdlib/string — lowcase", async () => assertEquals(await run("[lowcase(HELLO)]"),         "hello"));
Deno.test("stdlib/string — capstr",  async () => assertEquals(await run("[capstr(hello world)]"),    "Hello world"));
Deno.test("stdlib/string — trim",    async () => assertEquals(await run("[trim(  hi  )]"),           "hi"));
Deno.test("stdlib/string — left",    async () => assertEquals(await run("[left(hello,3)]"),          "hel"));
Deno.test("stdlib/string — right",   async () => assertEquals(await run("[right(hello,3)]"),         "llo"));
Deno.test("stdlib/string — mid",     async () => assertEquals(await run("[mid(hello,1,3)]"),         "ell"));
Deno.test("stdlib/string — reverse", async () => assertEquals(await run("[reverse(hello)]"),         "olleh"));
Deno.test("stdlib/string — space(5)",async () => assertEquals(await run("[space(5)]"),               "     "));
Deno.test("stdlib/string — repeat",  async () => assertEquals(await run("[repeat(ab,3)]"),           "ababab"));
Deno.test("stdlib/string — before",  async () => assertEquals(await run("[before(hello,l)]"),        "he"));
Deno.test("stdlib/string — after",   async () => assertEquals(await run("[after(hello,l)]"),         "lo"));
Deno.test("stdlib/string — chr(65)", async () => assertEquals(await run("[chr(65)]"),                "A"));
Deno.test("stdlib/string — ord(A)",  async () => assertEquals(await run("[ord(A)]"),                 "65"));
Deno.test("stdlib/string — ljust",   async () => assertEquals(await run("[ljust(hi,5)]"),            "hi   "));
Deno.test("stdlib/string — rjust",   async () => assertEquals(await run("[rjust(hi,5)]"),            "   hi"));
Deno.test("stdlib/string — center",  async () => assertEquals(await run("[center(hi,6)]"),           "  hi  "));
Deno.test("stdlib/string — index",   async () => assertEquals(await run("[index(hello,l,1)]"),       "3"));
Deno.test("stdlib/string — strmatch exact",    async () => assertEquals(await run("[strmatch(hello,hello)]"),  "1"));
Deno.test("stdlib/string — strmatch wildcard", async () => assertEquals(await run("[strmatch(hello,hel*)]"),   "1"));
Deno.test("stdlib/string — cat",     async () => assertEquals(await run("[cat(a,b,c)]"),             "a b c"));
Deno.test("stdlib/string — squish",  async () => assertEquals(await run("[squish(  a  b  )]"),       "a b"));

// ── List ──────────────────────────────────────────────────────────────────

Deno.test("stdlib/list — words",               async () => assertEquals(await run("[words(a b c)]"),              "3"));
Deno.test("stdlib/list — word(list,2)",        async () => assertEquals(await run("[word(a b c,2)]"),             "b"));
Deno.test("stdlib/list — first",               async () => assertEquals(await run("[first(a b c)]"),             "a"));
Deno.test("stdlib/list — last",                async () => assertEquals(await run("[last(a b c)]"),              "c"));
Deno.test("stdlib/list — rest",                async () => assertEquals(await run("[rest(a b c)]"),              "b c"));
Deno.test("stdlib/list — member",              async () => assertEquals(await run("[member(a b c,b)]"),          "2"));
Deno.test("stdlib/list — member missing",      async () => assertEquals(await run("[member(a b c,z)]"),          "0"));
Deno.test("stdlib/list — ldelete",             async () => assertEquals(await run("[ldelete(a b c,2)]"),         "a c"));
Deno.test("stdlib/list — insert",              async () => assertEquals(await run("[insert(a c,2,b)]"),          "a b c"));
Deno.test("stdlib/list — setunion",            async () => assertEquals(await run("[setunion(a b,b c)]"),        "a b c"));
Deno.test("stdlib/list — setinter",            async () => assertEquals(await run("[setinter(a b c,b c d)]"),    "b c"));
Deno.test("stdlib/list — setdiff",             async () => assertEquals(await run("[setdiff(a b c,b)]"),         "a c"));
Deno.test("stdlib/list — sort alpha",          async () => assertEquals(await run("[sort(c a b)]"),              "a b c"));
Deno.test("stdlib/list — sort numeric",        async () => assertEquals(await run("[sort(10 2 1,n)]"),           "1 2 10"));
Deno.test("stdlib/list — extract",             async () => assertEquals(await run("[extract(a b c d,2,2)]"),     "b c"));
Deno.test("stdlib/list — lnum",                async () => assertEquals(await run("[lnum(3)]"),                  "0 1 2"));
Deno.test("stdlib/list — grab",                async () => assertEquals(await run("[grab(apple banana cherry,ban*)]"), "banana"));
Deno.test("stdlib/list — graball",             async () => assertEquals(await run("[graball(apple banana cherry,*an*)]"), "banana"));
Deno.test("stdlib/list — revwords",            async () => assertEquals(await run("[revwords(a b c)]"),          "c b a"));

// ── Logic ─────────────────────────────────────────────────────────────────

Deno.test("stdlib/logic — t(1)",                async () => assertEquals(await run("[t(1)]"),                             "1"));
Deno.test("stdlib/logic — t(0)",                async () => assertEquals(await run("[t(0)]"),                             "0"));
Deno.test("stdlib/logic — t(nonzero)",          async () => assertEquals(await run("[t(5)]"),                             "1"));
Deno.test("stdlib/logic — not(1)",              async () => assertEquals(await run("[not(1)]"),                           "0"));
Deno.test("stdlib/logic — and(1,1)",            async () => assertEquals(await run("[and(1,1)]"),                         "1"));
Deno.test("stdlib/logic — and(1,0)",            async () => assertEquals(await run("[and(1,0)]"),                         "0"));
Deno.test("stdlib/logic — or(0,1)",             async () => assertEquals(await run("[or(0,1)]"),                          "1"));
Deno.test("stdlib/logic — xor(1,0)",            async () => assertEquals(await run("[xor(1,0)]"),                         "1"));
Deno.test("stdlib/logic — xor(1,1)",            async () => assertEquals(await run("[xor(1,1)]"),                         "0"));
Deno.test("stdlib/logic — if(1,yes)",           async () => assertEquals(await run("[if(1,yes)]"),                        "yes"));
Deno.test("stdlib/logic — ifelse(0,yes,no)",    async () => assertEquals(await run("[ifelse(0,yes,no)]"),                 "no"));
Deno.test("stdlib/logic — switch matches wildcard", async () => assertEquals(await run("[switch(hello,hel*,matched,default)]"), "matched"));
Deno.test("stdlib/logic — switch default",      async () => assertEquals(await run("[switch(xyz,hel*,matched,default)]"), "default"));
Deno.test("stdlib/logic — case exact match",    async () => assertEquals(await run("[case(FOO,foo,yes,no)]"),             "yes"));
Deno.test("stdlib/logic — null returns empty",  async () => assertEquals(await run("[null(anything)]"),                   ""));

// ── Object functions ──────────────────────────────────────────────────────

Deno.test("stdlib/object — name(me)", async () => assertEquals(await run("[name(me)]"), "Alice"));
Deno.test("stdlib/object — dbref(me)", async () => assertEquals(await run("[dbref(me)]"), "#100"));
Deno.test("stdlib/object — type(me) is PLAYER", async () => assertEquals(await run("[type(me)]"), "PLAYER"));
Deno.test("stdlib/object — hastype(me,player)", async () => assertEquals(await run("[hastype(me,player)]"), "1"));
Deno.test("stdlib/object — hasflag(me,player)", async () => assertEquals(await run("[hasflag(me,player)]"), "1"));
Deno.test("stdlib/object — hasflag(me,wizard)", async () => assertEquals(await run("[hasflag(me,wizard)]"), "0"));
Deno.test("stdlib/object — loc(me) returns room dbref", async () => {
  assertEquals(await run("[loc(me)]"), "#200");
});

Deno.test("stdlib/object — conn returns 0+ for connected actor", async () => {
  const result = await run("[conn(me)]");
  assertEquals(parseInt(result, 10) >= 0, true);
});

Deno.test("stdlib/object — conn returns -1 for non-connected object", async () => {
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
      lsearch:          async () => [],
      children:         async () => [],
      lchannels:        async () => "",
      channelsFor:      async () => "",
      mailCount:        async () => 0,
      queueLength:      async () => 0,
      getIdleSecs:      async () => 0,
      getUserFn:        async () => null,
    },
  });
  assertEquals(await runSoftcode("[conn(here)]", ctx), "-1");
});
