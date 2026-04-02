// deno-lint-ignore-file require-await
/**
 * tests/softcode_demo.test.ts
 *
 * End-to-end demo of the UrsaMU softcode engine.
 *
 * Each group walks through a meaningful scenario rather than
 * micro-testing a single function.  Together they show the engine
 * "going through its paces":
 *
 *   1. Substitutions  — %N %# %0-%9 %q0-%qz %r %b pronouns
 *   2. Registers      — setq/setr/r, localize isolation
 *   3. String pipeline — chained transforms, wrap, ansi, spellnum
 *   4. Math pipeline  — arithmetic, base conversion, roman, dist2d
 *   5. List pipeline  — sort / set ops / extract / lnum / graball
 *   6. iter           — function calls in iter, #@ position, nested iter, %i1
 *   7. User functions (u / ulocal) — fibonacci, factorial, attribute closures
 *   8. Object functions — name/type/flags/loc with a multi-object mock DB
 *   9. Output side effects — pemit/remit/emit/oemit capture
 *  10. Time functions — secs, digittime, singletime, etimefmt
 *  11. Complex composed expressions — real-world MUSH patterns
 *
 * Notes on iter / map / filter:
 *   - Function calls inside iter() must be wrapped in [eval blocks].
 *     Bare `func(args)` in the iter expression is treated as literal text
 *     by safeParse() (Start rule is command context, not expression context).
 *   - map() / filter() / fold() arg 0 is marked lazy, but the stdlib
 *     implementations currently read a[0] rather than raw[0], so those
 *     helpers are exercised here via iter + u() equivalents instead.
 */
import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import { parse }    from "../src/services/Softcode/parser.ts";
import { evaluate } from "../src/services/Softcode/evaluator.ts";
import type {
  EvalContext,
  DbAccessor,
  OutputAccessor,
} from "../src/services/Softcode/context.ts";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";
import "../src/services/Softcode/stdlib/index.ts";

// ── Test infrastructure ───────────────────────────────────────────────────────

function obj(
  id: string,
  name: string,
  flags: string[],
  extra: Partial<IDBObj> = {},
): IDBObj {
  return { id, name, flags: new Set(flags), location: "0", state: {}, contents: [], ...extra };
}

/**
 * Five-object world used by the DB / object / composed tests:
 *   1  Alice  (player, connected)   location: 10
 *   2  Bob    (player, connected)   location: 10
 *   3  Widget (thing)               location: 10
 *   10 Lobby  (room)
 *   99 Merlin (player, wizard)      location: 10
 */
const ALICE  = obj("1",  "Alice",  ["player", "connected"], { location: "10" });
const BOB    = obj("2",  "Bob",    ["player", "connected"], { location: "10" });
const WIDGET = obj("3",  "Widget", ["thing"],               { location: "10" });
const LOBBY  = obj("10", "Lobby",  ["room"],                { contents: [ALICE, BOB, WIDGET] });
const MERLIN = obj("99", "Merlin", ["player", "wizard"],    { location: "10" });

/** Attribute store simulates &ATTR on objects. */
const ATTRS: Record<string, Record<string, string>> = {
  "1": {
    DOING:    "exploring the demo",
    SEX:      "female",
    GREETING: "Hello, %0!  %S %s glad to meet you.",
  },
  "99": {
    // Fibonacci — lookup table (ifelse is eager, so recursive binary fib
    // causes depth-limit explosion; a table attr is idiomatic MUX practice)
    FIB:    "[word(0 1 1 2 3 5 8 13 21 34,add(%0,1))]",
    // Factorial — linear recursion (one recursive branch only, no blowup)
    FACT:   "[ifelse(lte(%0,1),1,mul(%0,u(#99/FACT,dec(%0))))]",
    // Simple UDFs used by iter tests
    DOUBLE: "[mul(%0,2)]",
    ISEVEN: "[not(mod(%0,2))]",
    PLUS:   "[add(%0,%1)]",
  },
};

function mockDb(): DbAccessor & {
  lsearch(o: { type?: string }): Promise<string[]>;
  children(id: string): Promise<IDBObj[]>;
  lchannels(): Promise<string>;
  channelsFor(id: string): Promise<string>;
  mailCount(id: string): Promise<number>;
  queueLength(id: string): Promise<number>;
  getIdleSecs(id: string): Promise<number>;
  getUserFn(name: string): Promise<string | null>;
} {
  const all = [ALICE, BOB, WIDGET, LOBBY, MERLIN];
  return {
    queryById:        async (id) => all.find(o => o.id === id) ?? null,
    queryByName:      async (n)  => all.find(o => (o.name ?? "").toLowerCase() === n.toLowerCase()) ?? null,
    lcon:             async (id) => id === "10" ? [ALICE, BOB, WIDGET] : [],
    lwho:             async ()   => [ALICE, BOB, MERLIN],
    lattr:            async (id) => Object.keys(ATTRS[id] ?? {}),
    getAttribute:     async (o, attr) => ATTRS[o.id]?.[attr.toUpperCase()] ?? null,
    getTagById:       async () => null,
    getPlayerTagById: async () => null,
    getUserFn:        async () => null,
    lsearch:  async (opts) => {
      if (opts.type === "ROOM")   return ["#10"];
      if (opts.type === "PLAYER") return ["#1", "#2", "#99"];
      if (opts.type === "THING")  return ["#3"];
      return all.map(o => `#${o.id}`);
    },
    children:    async () => [],
    lchannels:   async () => "",
    channelsFor: async () => "",
    mailCount:   async () => 0,
    queueLength: async () => 0,
    getIdleSecs: async () => 0,
  };
}

function makeOutput(): {
  sent: Array<{ msg: string; to?: string }>;
  rooms: Array<{ msg: string; room: string; exclude?: string }>;
  broadcasts: string[];
  accessor: OutputAccessor;
} {
  const sent:       Array<{ msg: string; to?: string }> = [];
  const rooms:      Array<{ msg: string; room: string; exclude?: string }> = [];
  const broadcasts: string[] = [];
  return {
    sent, rooms, broadcasts,
    accessor: {
      send:          (msg, to)           => { sent.push({ msg, to }); },
      roomBroadcast: (msg, room, exclude) => { rooms.push({ msg, room, exclude }); },
      broadcast:     (msg)               => { broadcasts.push(msg); },
    },
  };
}

function makeCtx(overrides: Partial<EvalContext> = {}): EvalContext {
  return {
    actor:     ALICE,
    executor:  ALICE,
    caller:    null,
    args:      [],
    registers: new Map(),
    iterStack: [],
    depth:     0,
    deadline:  Date.now() + 5000,
    db:        mockDb(),
    output:    makeOutput().accessor,
    ...overrides,
  };
}

async function run(
  code: string,
  overrides: Partial<EvalContext> = {},
): Promise<string> {
  const ast = parse(code, { startRule: "Start" });
  return evaluate(ast as Parameters<typeof evaluate>[0], makeCtx(overrides));
}

// ── 1. Substitutions ──────────────────────────────────────────────────────────

Deno.test("demo/subs — %N and %# give actor name and dbref", async () => {
  assertEquals(await run("%N is %#"), "Alice is #1");
});

Deno.test("demo/subs — %! is executor dbref", async () => {
  assertEquals(await run("%!"), "#1");
});

Deno.test("demo/subs — %@ is #-1 at top level (no caller)", async () => {
  assertEquals(await run("%@"), "#-1");
});

Deno.test("demo/subs — %0-%2 positional args", async () => {
  assertEquals(await run("%0 %1 %2", { args: ["alpha", "beta", "gamma"] }), "alpha beta gamma");
});

Deno.test("demo/subs — %+ gives arg count", async () => {
  assertEquals(await run("%+", { args: ["a", "b", "c"] }), "3");
});

Deno.test("demo/subs — %r %t %b formatting escapes", async () => {
  const result = await run("a%rb%tc%bd");
  assertStringIncludes(result, "\n");
  assertStringIncludes(result, "\t");
  assertStringIncludes(result, " ");
});

Deno.test("demo/subs — %% produces a literal percent sign", async () => {
  assertEquals(await run("100%%"), "100%");
});

Deno.test("demo/subs — %[ and %] are literal brackets (not eval)", async () => {
  assertEquals(await run("%[not evaluated%]"), "[not evaluated]");
});

Deno.test("demo/subs — %L gives actor location dbref", async () => {
  assertEquals(await run("%L"), "#10");
});

Deno.test("demo/subs — %q0 reads a pre-set register", async () => {
  const ctx = makeCtx();
  ctx.registers.set("0", "stored");
  assertEquals(await run("%q0", ctx), "stored");
});

Deno.test("demo/subs — female pronouns from SEX attr on actor", async () => {
  // Alice has SEX=female in the mock attribute store.
  assertEquals(await run("%s"), "she");
  assertEquals(await run("%S"), "She");
  assertEquals(await run("%o"), "her");
  assertEquals(await run("%p"), "her");
});

// ── 2. Registers ──────────────────────────────────────────────────────────────

Deno.test("demo/registers — setq/r round-trip", async () => {
  assertEquals(await run("[setq(0,hello)][r(0)]"), "hello");
});

Deno.test("demo/registers — setr returns the stored value inline", async () => {
  assertEquals(await run("[setr(x,world)]"), "world");
});

Deno.test("demo/registers — multi-setq in one call", async () => {
  assertEquals(await run("[setq(0,a,1,b,2,c)][r(0)][r(1)][r(2)]"), "abc");
});

Deno.test("demo/registers — chained calculation using registers", async () => {
  // sum = (3 * 7) + 10 = 31
  assertEquals(await run("[setq(0,3)][setq(1,7)][setq(2,10)][add(mul(%q0,%q1),%q2)]"), "31");
});

Deno.test("demo/registers — localize isolates inner setq changes", async () => {
  // %q0 = "outer" before and after the localize block
  assertEquals(await run("[setq(0,outer)][localize([setq(0,inner)])][r(0)]"), "outer");
});

Deno.test("demo/registers — localize returns its expression result", async () => {
  assertEquals(await run("[localize([setq(0,42)][r(0)])]"), "42");
});

// ── 3. String pipeline ────────────────────────────────────────────────────────

Deno.test("demo/strings — upcase → center → ljust pipeline", async () => {
  assertEquals(await run("[ljust([center([upcase(hello)],9,-)],15,.)]"), "--HELLO--......");
});

Deno.test("demo/strings — edit to build a slug", async () => {
  // 'Hello World' → lowercase → spaces replaced with hyphens
  assertEquals(await run("[edit([lowcase(Hello World)], ,[-])]"), "hello-world");
});

Deno.test("demo/strings — wrap at 20 chars inserts newlines", async () => {
  assertStringIncludes(await run("[wrap(the quick brown fox jumps over,20)]"), "\r\n");
});

Deno.test("demo/strings — repeat + reverse as a simple border", async () => {
  assertEquals(await run("[repeat([reverse(AB)],4)]"), "BABABABA");
});

Deno.test("demo/strings — strmatch with glob wildcards", async () => {
  assertEquals(await run("[strmatch(hello world,hello *)]"), "1");
  assertEquals(await run("[strmatch(foobar,*bar)]"), "1");
  assertEquals(await run("[strmatch(baz,foo*)]"), "0");
});

Deno.test("demo/strings — regmatch / regmatchi return 1 or 0", async () => {
  assertEquals(await run("[regmatch(hello123,hello)]"),  "1");
  assertEquals(await run("[regmatchi(HELLO,hello)]"),    "1");  // case-insensitive
  assertEquals(await run("[regmatch(hello,xyz)]"),       "0");
});

Deno.test("demo/strings — itemize produces natural-language list", async () => {
  assertEquals(await run("[itemize(red green blue)]"), "red, green, and blue");
});

Deno.test("demo/strings — spellnum converts integers to English words", async () => {
  assertEquals(await run("[spellnum(42)]"),  "forty-two");
  assertEquals(await run("[spellnum(101)]"), "one hundred one");
});

Deno.test("demo/strings — sha1 produces a 40-char hex digest", async () => {
  assertMatch(await run("[sha1(hello)]"), /^[0-9a-f]{40}$/);
});

// ── 4. Math pipeline ──────────────────────────────────────────────────────────

Deno.test("demo/math — compound arithmetic: (2^10 - 1) / 3 = 341", async () => {
  assertEquals(await run("[div(sub(power(2,10),1),3)]"), "341");
});

Deno.test("demo/math — pythagorean triple via dist2d(0,0,3,4) = 5", async () => {
  assertEquals(await run("[dist2d(0,0,3,4)]"), "5");
});

Deno.test("demo/math — baseconv: hex ff → decimal 255 → binary", async () => {
  assertEquals(await run("[baseconv(ff,16,10)]"), "255");
  assertEquals(await run("[baseconv(255,10,2)]"), "11111111");
});

Deno.test("demo/math — bitwise AND / OR / XOR (decimal inputs)", async () => {
  assertEquals(await run("[band(12,10)]"), `${12 & 10}`);  // 8
  assertEquals(await run("[bor(12,10)]"),  `${12 | 10}`);  // 14
  assertEquals(await run("[bxor(12,10)]"), `${12 ^ 10}`);  // 6
});

Deno.test("demo/math — roman numeral conversion", async () => {
  assertEquals(await run("[roman(1999)]"), "MCMXCIX");
  assertEquals(await run("[roman(42)]"),   "XLII");
});

Deno.test("demo/math — division by zero returns #-1 error", async () => {
  assertStringIncludes(await run("[div(1,0)]"), "#-1");
});

// ── 5. List pipeline ──────────────────────────────────────────────────────────

Deno.test("demo/lists — lnum builds range, ladd sums it", async () => {
  assertEquals(await run("[ladd([lnum(1,5)])]"), "15");
});

Deno.test("demo/lists — sort → member: banana is 2nd alphabetically", async () => {
  assertEquals(await run("[member([sort(cherry banana apple)],banana)]"), "2");
});

Deno.test("demo/lists — set union and intersection", async () => {
  assertEquals(await run("[setunion(a b c,b c d e)]"), "a b c d e");
  assertEquals(await run("[setinter(a b c d,c d e f)]"), "c d");
});

Deno.test("demo/lists — revwords then ldelete", async () => {
  // "a b c d" reversed → "d c b a", delete pos 2 → "d b a"
  assertEquals(await run("[ldelete([revwords(a b c d)],2)]"), "d b a");
});

Deno.test("demo/lists — splice two lists", async () => {
  // insert "b c" at pos 2 of "a d e" → "a b c d e"
  assertEquals(await run("[splice(a d e,b c,2)]"), "a b c d e");
});

Deno.test("demo/lists — graball with wildcard", async () => {
  assertEquals(await run("[graball(apple apricot banana avocado,a*)]"), "apple apricot avocado");
});

// ── 6. iter — function calls, position, and nested iteration ──────────────────
//
// IMPORTANT: function calls inside iter() must be wrapped in [eval blocks].
// Bare func(##) in the expression arg is in command-parse context and is
// treated as literal text by safeParse(); only [func(##)] triggers evaluation.

Deno.test("demo/iter — [mul(##,##)] squares each number", async () => {
  assertEquals(await run("[iter(1 2 3 4 5,[mul(##,##)])]"), "1 4 9 16 25");
});

Deno.test("demo/iter — #@ gives 1-based position", async () => {
  // #@ alone in the iter body is correctly replaced with each position.
  assertEquals(await run("[iter(a b c,#@)]"), "1 2 3");
});

Deno.test("demo/iter — ## gives current item", async () => {
  // ## alone works as an uneval'd substitution from safeParse.
  assertEquals(await run("[iter(a b c,##)]"), "a b c");
});

Deno.test("demo/iter — [u()] UDF call for each item (map pattern)", async () => {
  // DOUBLE = [mul(%0,2)]
  assertEquals(await run("[iter(1 2 3 4 5,[u(#99/DOUBLE,##)])]"), "2 4 6 8 10");
});

Deno.test("demo/iter — fold-style sum via register accumulator", async () => {
  // setq() returns "" so iter output is all spaces — trim to assert the register value.
  const code = "[setq(0,0)][iter(1 2 3 4 5,[setq(0,[add(%q0,##)])])][r(0)]";
  assertEquals((await run(code)).trim(), "15");
});

Deno.test("demo/iter — filter-style evens via iter + if + squish", async () => {
  // [if(even,##)] returns the number or "" — squish collapses the gaps
  const code = "[squish([iter(1 2 3 4 5 6,[if([not([mod(##,2)])],##)])])]";
  assertEquals(await run(code), "2 4 6");
});

Deno.test("demo/iter — custom output delimiter (pipe-separated)", async () => {
  // iter(list, expr, iDelim, oDelim) — 4-arg form, space input delim, | output delim
  assertEquals(await run("[iter(a b c,[upcase(##)], ,|)]"), "A|B|C");
});

Deno.test("demo/iter — nested iter with %i1 accesses outer item", async () => {
  // Outer iterates 1..2; inner iterates 1..2; %i1 = outer item
  // Results: mul(1,1) mul(1,2) mul(2,1) mul(2,2) = "1 2 2 4"
  assertEquals(await run("[iter(1 2,[iter(1 2,[mul(%i1,##)])])]"), "1 2 2 4");
});

// ── 7. User functions — u() / ulocal() ───────────────────────────────────────

Deno.test("demo/udf — u() calls an attribute on another object", async () => {
  // #99/DOUBLE = [mul(%0,2)]
  assertEquals(await run("[u(#99/DOUBLE,7)]"), "14");
});

Deno.test("demo/udf — factorial via linear-recursive u()", async () => {
  assertEquals(await run("[u(#99/FACT,0)]"),  "1");
  assertEquals(await run("[u(#99/FACT,5)]"),  "120");
  assertEquals(await run("[u(#99/FACT,10)]"), "3628800");
});

Deno.test("demo/udf — fibonacci lookup via u() (0..7)", async () => {
  // FIB uses word() on a precomputed list — demonstrates u() arg passing.
  const cases: [number, string][] = [
    [0, "0"], [1, "1"], [2, "1"], [3, "2"], [4, "3"], [5, "5"], [6, "8"], [7, "13"],
  ];
  for (const [n, expected] of cases) {
    const result = await run(`[u(#99/FIB,${n})]`);
    assertEquals(result, expected, `fib(${n})`);
  }
});

Deno.test("demo/udf — ulocal does not pollute outer registers", async () => {
  // Set %q0=outer before the call; ulocal should not change it
  const ctx = makeCtx();
  ctx.registers.set("0", "outer");
  const ast = parse("[ulocal(#99/DOUBLE,5)]%q0", { startRule: "Start" });
  const result = await evaluate(ast as Parameters<typeof evaluate>[0], ctx);
  assertEquals(result, "10outer"); // ulocal result = 10, %q0 still = "outer"
});

Deno.test("demo/udf — u() with pronoun substitution attribute", async () => {
  // Alice has GREETING = "Hello, %0!  %S %s glad to meet you."
  const result = await run("[u(#1/GREETING,Bob)]");
  assertStringIncludes(result, "Hello, Bob!");
  assertStringIncludes(result, "She");   // female pronoun from SEX attr
});

// ── 8. Object / DB functions ──────────────────────────────────────────────────

Deno.test("demo/objects — name / type / dbref for all object types", async () => {
  assertEquals(await run("[name(#1)]"),  "Alice");
  assertEquals(await run("[type(#1)]"),  "PLAYER");
  assertEquals(await run("[type(#10)]"), "ROOM");
  assertEquals(await run("[type(#3)]"),  "THING");
  assertEquals(await run("[dbref(#2)]"), "#2");
});

Deno.test("demo/objects — hasflag: present and absent flags", async () => {
  assertEquals(await run("[hasflag(#1,player)]"),  "1");
  assertEquals(await run("[hasflag(#99,wizard)]"), "1");
  assertEquals(await run("[hasflag(#1,wizard)]"),  "0");
});

Deno.test("demo/objects — loc returns location dbref", async () => {
  assertEquals(await run("[loc(#1)]"),  "#10");
  assertEquals(await run("[loc(#99)]"), "#10");
});

Deno.test("demo/objects — lcon lists room contents as dbrefs", async () => {
  const result = await run("[lcon(#10)]");
  assertStringIncludes(result, "#1");
  assertStringIncludes(result, "#2");
  assertStringIncludes(result, "#3");
});

Deno.test("demo/objects — nplayers and nrooms from mock DB", async () => {
  assertEquals(await run("[nplayers()]"), "3");
  assertEquals(await run("[nrooms()]"),   "1");
});

Deno.test("demo/objects — pmatch finds a player by name prefix", async () => {
  assertEquals(await run("[pmatch(bob)]"), "#2");
});

Deno.test("demo/objects — controls: actor controls themselves", async () => {
  assertEquals(await run("[controls(me,me)]"), "1");
});

Deno.test("demo/objects — nearby: two objects in the same room", async () => {
  assertEquals(await run("[nearby(#1,#2)]"), "1");
});

Deno.test("demo/objects — get retrieves an attribute value", async () => {
  assertEquals(await run("[get(#1/DOING)]"), "exploring the demo");
});

Deno.test("demo/objects — hasattr / lattr / default", async () => {
  assertEquals(await run("[hasattr(#1,DOING)]"),              "1");
  assertEquals(await run("[hasattr(#1,NOSUCH)]"),             "0");
  assertEquals(await run("[default(#1/NOSUCH,fallback)]"),    "fallback");
  assertEquals(await run("[default(#1/DOING,fallback)]"),     "exploring the demo");
  assertStringIncludes(await run("[lattr(#99)]"), "FIB");
});

Deno.test("demo/objects — moniker falls back to name", async () => {
  // Alice has no MONIKER attribute → returns name
  assertEquals(await run("[moniker(#1)]"), "Alice");
});

// ── 9. Output side effects ────────────────────────────────────────────────────

Deno.test("demo/output — pemit sends to a specific object", async () => {
  const cap = makeOutput();
  const ctx = makeCtx({ output: cap.accessor });
  await run("[pemit(#1,Hello Alice!)]", ctx);
  assertEquals(cap.sent.length, 1);
  assertEquals(cap.sent[0].msg, "Hello Alice!");
  assertEquals(cap.sent[0].to,  "1");
});

Deno.test("demo/output — remit broadcasts to a room", async () => {
  const cap = makeOutput();
  await run("[remit(#10,The room shakes.)]", makeCtx({ output: cap.accessor }));
  assertEquals(cap.rooms.length, 1);
  assertEquals(cap.rooms[0].msg,  "The room shakes.");
  assertEquals(cap.rooms[0].room, "10");
});

Deno.test("demo/output — oemit broadcasts excluding the target player", async () => {
  const cap = makeOutput();
  await run("[oemit(#1,Alice does something.)]", makeCtx({ output: cap.accessor }));
  assertEquals(cap.rooms.length, 1);
  assertEquals(cap.rooms[0].exclude, "1");
});

Deno.test("demo/output — emit broadcasts to executor's room", async () => {
  const cap = makeOutput();
  await run("[emit(A sound echoes.)]", makeCtx({ output: cap.accessor }));
  assertEquals(cap.rooms.length, 1);
  assertEquals(cap.rooms[0].room, "10");
});

Deno.test("demo/output — pemit to unknown target returns #-1", async () => {
  assertStringIncludes(await run("[pemit(#999,hi)]"), "#-1");
});

// ── 10. Time functions ────────────────────────────────────────────────────────

Deno.test("demo/time — secs() returns a real unix timestamp", async () => {
  const n = parseInt(await run("[secs()]"), 10);
  assertEquals(Math.abs(n - Math.floor(Date.now() / 1000)) < 60, true);
});

Deno.test("demo/time — msecs() is in millisecond range", async () => {
  const ms = parseInt(await run("[msecs()]"), 10);
  assertEquals(ms > 1_000_000_000_000, true); // > year 2001 timestamp
});

Deno.test("demo/time — digittime formats seconds as HH:MM:SS", async () => {
  assertEquals(await run("[digittime(3661)]"),  "01:01:01");
  assertEquals(await run("[digittime(90061)]"), "1:01:01:01");
  assertEquals(await run("[digittime(0)]"),     "00:00:00");
});

Deno.test("demo/time — singletime gives compact human-readable duration", async () => {
  assertEquals(await run("[singletime(45)]"),    "45s");
  assertEquals(await run("[singletime(120)]"),   "2m");
  assertEquals(await run("[singletime(7200)]"),  "2h");
  assertEquals(await run("[singletime(86400)]"), "1d");
});

Deno.test("demo/time — etimefmt formats elapsed seconds (escape %% in format)", async () => {
  // %H/%M/%S inside a softcode string must be escaped as %%H/%%M/%%S
  // so they reach etimefmt as literal format tokens rather than substitutions.
  assertEquals(await run("[etimefmt(%%H:%%M:%%S,3661)]"), "01:01:01");
  assertEquals(await run("[etimefmt(%%H:%%M:%%S,0)]"),    "00:00:00");
});

// ── 11. Complex composed expressions ──────────────────────────────────────────

Deno.test("demo/composed — format WHO list using iter + [name(##)]", async () => {
  // lwho() returns dbrefs; iter maps each to its name
  const result = await run("[iter([lwho()],[name(##)])]");
  assertStringIncludes(result, "Alice");
  assertStringIncludes(result, "Bob");
  assertStringIncludes(result, "Merlin");
});

Deno.test("demo/composed — sort all online player names alphabetically", async () => {
  assertEquals(await run("[sort([iter([lwho()],[name(##)])])]"), "Alice Bob Merlin");
});

Deno.test("demo/composed — conditional greeting based on wizard flag", async () => {
  const code = "[ifelse(hasflag(%#,wizard),Welcome archmage,Hello [name(%#)])]";
  assertEquals(await run(code),                                     "Hello Alice");
  assertEquals(await run(code, { actor: MERLIN, executor: MERLIN }), "Welcome archmage");
});

Deno.test("demo/composed — register accumulator across iter (sum 1..5)", async () => {
  const code = "[setq(0,0)][iter(1 2 3 4 5,[setq(0,[add(%q0,##)])])][r(0)]";
  assertEquals((await run(code)).trim(), "15");
});

Deno.test("demo/composed — switch dispatch on object type", async () => {
  const code = "[switch([type(%#)],PLAYER,you are a player,ROOM,you are a room,unknown)]";
  assertEquals(await run(code), "you are a player");
});

Deno.test("demo/composed — nested iter builds a 2×2 multiplication table", async () => {
  // Outer iter: 1 2.  Inner iter: 1 2.  %i1 = outer item.
  const result = await run("[iter(1 2,[iter(1 2,[mul(%i1,##)])])]");
  assertEquals(result, "1 2 2 4");
});

Deno.test("demo/composed — fibonacci sequence 0..7 via iter + u()", async () => {
  // lnum(0,7) = "0 1 2 3 4 5 6 7"  →  iter maps each n to u(FIB,n)
  assertEquals(
    await run("[iter([lnum(0,7)],[u(#99/FIB,##)])]"),
    "0 1 1 2 3 5 8 13",
  );
});

Deno.test("demo/composed — even-filter pipeline: iter + if + squish", async () => {
  const code = "[squish([iter([lnum(1,8)],[if([not([mod(##,2)])],##)])])]";
  assertEquals(await run(code), "2 4 6 8");
});
