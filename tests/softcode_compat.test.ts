/**
 * tests/softcode_compat.test.ts
 *
 * Tests for the RhostMUSH/TinyMUX compatibility functions added in:
 *   stdlib/string-compat.ts  — tr, printf, char predicates, regedit variants,
 *                              reswitch, regrep, reglmatch, wrapcolumns,
 *                              encode64/decode64, strdistance, nameq/nameqm
 *   stdlib/list-compat.ts   — listdiff/listinter/listunion, sortlist, shift,
 *                              avg/lavg, lmath, nummatch/nummember/numpos,
 *                              lset/lreplace, firstof/allof, dice/die, lsub
 *   stdlib/object-compat.ts — ueval, u2/u2local, obj/subj/poss/aposs, set/wipe
 */
// deno-lint-ignore-file require-await
import { assertEquals } from "@std/assert";
import { runSoftcode, softcodeEngine } from "@ursamu/mush";
import type { UrsaEvalContext } from "@ursamu/mush";
import type { DbAccessor, OutputAccessor } from "@ursamu/mush";
import type { IDBObj } from "@ursamu/mush";

// ── shared helpers ────────────────────────────────────────────────────────────

function makeActor(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "compat_actor1",
    name: "Alice",
    flags: new Set(["player", "connected"]),
    location: "compat_room1",
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
    deadline:     Date.now() + 5_000,
    db:           makeDb(),
    output:       noOutput,
    _engine:      softcodeEngine,
    ...overrides,
  };
}

function run(code: string, ctx?: Partial<UrsaEvalContext>): Promise<string> {
  return runSoftcode(code, makeCtx(ctx));
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRING-COMPAT
// ═══════════════════════════════════════════════════════════════════════════════

// ── aliases ───────────────────────────────────────────────────────────────────

Deno.test("compat/string — asc returns ASCII code point", async () =>
  assertEquals(await run("[asc(A)]"), "65")
);
Deno.test("compat/string — asc of lowercase", async () =>
  assertEquals(await run("[asc(a)]"), "97")
);
Deno.test("compat/string — flip reverses string", async () =>
  assertEquals(await run("[flip(hello)]"), "olleh")
);
Deno.test("compat/string — flip empty string", async () =>
  assertEquals(await run("[flip()]"), "")
);
Deno.test("compat/string — chomp strips trailing newline", async () =>
  assertEquals(await run("[chomp(line%r)]"), "line")
);
Deno.test("compat/string — chomp no newline is identity", async () =>
  assertEquals(await run("[chomp(hello)]"), "hello")
);

// ── character class predicates ────────────────────────────────────────────────

Deno.test("compat/string — isalpha passes on letters", async () =>
  assertEquals(await run("[isalpha(abc)]"), "1")
);
Deno.test("compat/string — isalpha fails on digits", async () =>
  assertEquals(await run("[isalpha(ab1)]"), "0")
);
Deno.test("compat/string — isdigit passes on digits", async () =>
  assertEquals(await run("[isdigit(123)]"), "1")
);
Deno.test("compat/string — isdigit fails on letters", async () =>
  assertEquals(await run("[isdigit(12x)]"), "0")
);
Deno.test("compat/string — islower passes on lowercase", async () =>
  assertEquals(await run("[islower(abc)]"), "1")
);
Deno.test("compat/string — islower fails on uppercase", async () =>
  assertEquals(await run("[islower(Abc)]"), "0")
);
Deno.test("compat/string — isupper passes on uppercase", async () =>
  assertEquals(await run("[isupper(ABC)]"), "1")
);
Deno.test("compat/string — isupper fails on lowercase", async () =>
  assertEquals(await run("[isupper(ABc)]"), "0")
);
Deno.test("compat/string — isspace passes on whitespace", async () =>
  assertEquals(await run("[isspace(   )]"), "1")
);
Deno.test("compat/string — isspace fails on non-space", async () =>
  assertEquals(await run("[isspace( a )]"), "0")
);
Deno.test("compat/string — isxdigit passes on hex chars", async () =>
  assertEquals(await run("[isxdigit(1aFb)]"), "1")
);
Deno.test("compat/string — isxdigit fails on non-hex", async () =>
  assertEquals(await run("[isxdigit(1g)]"), "0")
);

// ── tr ────────────────────────────────────────────────────────────────────────

Deno.test("compat/string — tr replaces chars one-for-one", async () =>
  assertEquals(await run("[tr(aeiou,*,hello world)]"), "h*ll* w*rld")
);
Deno.test("compat/string — tr with shorter to fills with last char", async () =>
  // a→X  b→Y  c→Y (last char fills)  → XYY XYY
  assertEquals(await run("[tr(abc,XY,abcabc)]"), "XYYXYY")
);
Deno.test("compat/string — tr deletes chars when to is empty", async () =>
  assertEquals(await run("[tr(aeiou,,hello world)]"), "hll wrld")
);
Deno.test("compat/string — tr with no from returns original", async () =>
  assertEquals(await run("[tr(,x,hello)]"), "hello")
);

// ── printf ────────────────────────────────────────────────────────────────────
// In MUSH softcode, %% expands to a literal %. Format specifiers like %d, %f
// are not valid MUSH substitutions and cause a ParseError if written bare.
// The correct idiom is [printf(%%d,42)] — %% → % before printf is called.

Deno.test("compat/string — printf %%d basic integer", async () =>
  assertEquals(await run("[printf(%%d,42)]"), "42")
);
Deno.test("compat/string — printf %%05d zero-padded", async () =>
  assertEquals(await run("[printf(%%05d,42)]"), "00042")
);
Deno.test("compat/string — printf %%-10s left-justified", async () =>
  assertEquals(await run("[printf(%%-10s,hi)]"), "hi        ")
);
Deno.test("compat/string — printf %%8.2f float with precision", async () =>
  assertEquals(await run("[printf(%%8.2f,3.14159)]"), "    3.14")
);
Deno.test("compat/string — printf %%x hex lowercase", async () =>
  assertEquals(await run("[printf(%%x,255)]"), "ff")
);
Deno.test("compat/string — printf %%X hex uppercase", async () =>
  assertEquals(await run("[printf(%%X,255)]"), "FF")
);
Deno.test("compat/string — printf literal percent via %%%%", async () =>
  assertEquals(await run("[printf(100%%%%)]"), "100%")
);
Deno.test("compat/string — printf multiple format specs", async () =>
  assertEquals(await run("[printf(%%d items at %%d each,5,3)]"), "5 items at 3 each")
);
Deno.test("compat/string — printf %%o octal", async () =>
  assertEquals(await run("[printf(%%o,8)]"), "10")
);

// ── regedit variants ──────────────────────────────────────────────────────────

Deno.test("compat/string — regedit replaces first match only", async () =>
  assertEquals(await run("[regedit(hello world,o,0)]"), "hell0 world")
);
Deno.test("compat/string — regeditall replaces all matches", async () =>
  assertEquals(await run("[regeditall(hello world,o,0)]"), "hell0 w0rld")
);
Deno.test("compat/string — regediti case-insensitive first", async () =>
  assertEquals(await run("[regediti(Hello World,h,X)]"), "Xello World")
);
Deno.test("compat/string — regeditalli case-insensitive all", async () =>
  assertEquals(await run("[regeditalli(HaHaHa,h,X)]"), "XaXaXa")
);
Deno.test("compat/string — regeditlit literal replacement no capture group sub", async () => {
  // Without 'lit': regeditall(hello,(l+),$1) → replaces 'll' with captured group 'l'
  // With 'lit':    $1 is treated as a literal string, not a capture group reference
  const fn = (await import("../packages/mush/src/softcode/stdlib/index.ts")).lookup("regeditlit")!;
  // (l+) matches 'll' (positions 2-3) → replaced by literal "$1-$1"
  assertEquals(await fn(["hello", "(l+)", "$1-$1"], {} as never, []), "he$1-$1o");
});
Deno.test("compat/string — regeditalllit replaces all, literal replacement", async () => {
  // regeditall(hello,l,$0) without lit → $0 is not a valid JS capture ref (literal)
  // regeditalllit(hello,l,$0) → replaces each 'l' with literal "$0"
  const fn = (await import("../packages/mush/src/softcode/stdlib/index.ts")).lookup("regeditalllit")!;
  assertEquals(await fn(["hello", "l", "$0"], {} as never, []), "he$0$0o");
});
Deno.test("compat/string — regedit bad regex returns original string unchanged", async () => {
  // Use lookup() directly to avoid MUSH parser interpreting the test string
  const fn = (await import("../packages/mush/src/softcode/stdlib/index.ts")).lookup("regedit")!;
  assertEquals(await fn(["safe input", "[invalid", "x"], {} as never, []), "safe input");
});

// ── reswitch variants ─────────────────────────────────────────────────────────

Deno.test("compat/string — reswitch matches first pattern", async () =>
  assertEquals(await run("[reswitch(foo,^f,yes,^b,no)]"), "yes")
);
Deno.test("compat/string — reswitch falls through to default", async () =>
  assertEquals(await run("[reswitch(foo,^b,no,^c,nope,miss)]"), "miss")
);
Deno.test("compat/string — reswitch no match no default returns empty", async () =>
  assertEquals(await run("[reswitch(foo,^b,no,^c,nope)]"), "")
);
Deno.test("compat/string — reswitchi case-insensitive match", async () =>
  assertEquals(await run("[reswitchi(FOO,^foo,yes)]"), "yes")
);
Deno.test("compat/string — reswitchall returns all matching values", async () =>
  assertEquals(await run("[reswitchall(foo,^f,F-match,oo$,OO-match)]"), "F-match OO-match")
);
Deno.test("compat/string — reswitchalli case-insensitive all matches", async () =>
  assertEquals(await run("[reswitchalli(FOO,^foo,yes,OO$,tail)]"), "yes tail")
);

// ── regrep / regrepi ──────────────────────────────────────────────────────────

Deno.test("compat/string — regrep filters list by regex", async () =>
  assertEquals(await run("[regrep(foo bar baz,^ba)]"), "bar baz")
);
Deno.test("compat/string — regrep no matches returns empty", async () =>
  assertEquals(await run("[regrep(foo bar,^z)]"), "")
);
Deno.test("compat/string — regrepi case-insensitive", async () =>
  assertEquals(await run("[regrepi(Foo BAR baz,^ba)]"), "BAR baz")
);
Deno.test("compat/string — regrep invalid regex returns empty", async () => {
  const fn = (await import("../packages/mush/src/softcode/stdlib/index.ts")).lookup("regrep")!;
  assertEquals(await fn(["a b c", "[bad"], {} as never, []), "");
});

// ── reglmatch variants ────────────────────────────────────────────────────────

Deno.test("compat/string — reglmatch returns 1-indexed position of first match", async () =>
  assertEquals(await run("[reglmatch(foo bar baz,^ba)]"), "2")
);
Deno.test("compat/string — reglmatch no match returns 0", async () =>
  assertEquals(await run("[reglmatch(foo bar,^z)]"), "0")
);
Deno.test("compat/string — reglmatchi case-insensitive", async () =>
  assertEquals(await run("[reglmatchi(Foo BAR baz,^bar)]"), "2")
);
Deno.test("compat/string — reglmatchall returns all positions", async () =>
  assertEquals(await run("[reglmatchall(foo bar baz,^ba)]"), "2 3")
);
Deno.test("compat/string — reglmatchalli all positions case-insensitive", async () =>
  assertEquals(await run("[reglmatchalli(Foo BAR Baz,^ba)]"), "2 3")
);

// ── regnummatch / regnummatchi ────────────────────────────────────────────────

Deno.test("compat/string — regnummatch counts regex matches", async () =>
  assertEquals(await run("[regnummatch(foo bar baz,^ba)]"), "2")
);
Deno.test("compat/string — regnummatchi case-insensitive count", async () =>
  assertEquals(await run("[regnummatchi(FOO foo BAR,^foo)]"), "2")
);
Deno.test("compat/string — regnummatch no match returns 0", async () =>
  assertEquals(await run("[regnummatch(a b c,^z)]"), "0")
);

// ── wrapcolumns ───────────────────────────────────────────────────────────────

Deno.test("compat/string — wrapcolumns wraps to column width", async () => {
  const result = await run("[wrapcolumns(one two three four five,1,10)]");
  assertEquals(result.includes("\r\n"), true);
});
Deno.test("compat/string — wrapcolumns single line fits within width", async () => {
  const result = await run("[wrapcolumns(hi,1,20)]");
  assertEquals(result, "hi");
});

// ── base64 encode / decode ────────────────────────────────────────────────────

Deno.test("compat/string — encode64 encodes to base64", async () =>
  assertEquals(await run("[encode64(hello)]"), "aGVsbG8=")
);
Deno.test("compat/string — decode64 decodes from base64", async () =>
  assertEquals(await run("[decode64(aGVsbG8=)]"), "hello")
);
Deno.test("compat/string — encode64/decode64 roundtrip", async () =>
  assertEquals(await run("[decode64([encode64(Hello World!)])]"), "Hello World!")
);
Deno.test("compat/string — decode64 invalid input returns error token", async () =>
  assertEquals(await run("[decode64(!!!)]"), "#-1 INVALID BASE64")
);

// ── strdistance ───────────────────────────────────────────────────────────────

Deno.test("compat/string — strdistance kitten→sitting is 3", async () =>
  assertEquals(await run("[strdistance(kitten,sitting)]"), "3")
);
Deno.test("compat/string — strdistance identical strings is 0", async () =>
  assertEquals(await run("[strdistance(hello,hello)]"), "0")
);
Deno.test("compat/string — strdistance empty from string", async () =>
  assertEquals(await run("[strdistance(,abc)]"), "3")
);
Deno.test("compat/string — strdistance empty to string", async () =>
  assertEquals(await run("[strdistance(abc,)]"), "3")
);

// ── nameq / nameqm ────────────────────────────────────────────────────────────

Deno.test("compat/string — nameq case-insensitive equality", async () =>
  assertEquals(await run("[nameq(Alice,alice)]"), "1")
);
Deno.test("compat/string — nameq different names", async () =>
  assertEquals(await run("[nameq(Alice,Bob)]"), "0")
);
Deno.test("compat/string — nameqm glob match", async () =>
  assertEquals(await run("[nameqm(Alice,Al*)]"), "1")
);
Deno.test("compat/string — nameqm no match", async () =>
  assertEquals(await run("[nameqm(Alice,Bob*)]"), "0")
);

// ═══════════════════════════════════════════════════════════════════════════════
// LIST-COMPAT
// ═══════════════════════════════════════════════════════════════════════════════

// ── set-operation aliases ─────────────────────────────────────────────────────

Deno.test("compat/list — listdiff removes elements", async () =>
  assertEquals(await run("[listdiff(a b c,b c)]"), "a")
);
Deno.test("compat/list — listinter intersection", async () =>
  assertEquals(await run("[listinter(a b c,b c d)]"), "b c")
);
Deno.test("compat/list — listunion union", async () =>
  assertEquals(await run("[listunion(a b,b c)]"), "a b c")
);
Deno.test("compat/list — sortlist sorts alphabetically", async () =>
  assertEquals(await run("[sortlist(c a b)]"), "a b c")
);

// ── shift ─────────────────────────────────────────────────────────────────────

Deno.test("compat/list — shift returns first element", async () =>
  assertEquals(await run("[shift(a b c)]"), "a")
);
Deno.test("compat/list — shift single element", async () =>
  assertEquals(await run("[shift(x)]"), "x")
);
Deno.test("compat/list — shift empty list returns empty", async () =>
  assertEquals(await run("[shift()]"), "")
);

// ── lset / lreplace ──────────────────────────────────────────────────────────

Deno.test("compat/list — lset replaces element at position", async () =>
  assertEquals(await run("[lset(a b c,2,X)]"), "a X c")
);
Deno.test("compat/list — lreplace is alias for lset", async () =>
  assertEquals(await run("[lreplace(a b c,1,Z)]"), "Z b c")
);
Deno.test("compat/list — lset out-of-bounds leaves list unchanged", async () =>
  assertEquals(await run("[lset(a b c,9,X)]"), "a b c")
);

// ── firstof / allof ──────────────────────────────────────────────────────────

Deno.test("compat/list — firstof returns first non-empty element", async () =>
  assertEquals(await run("[firstof( a b c)]"), "a")
);
Deno.test("compat/list — allof returns all non-empty elements", async () =>
  assertEquals(await run("[allof(a  b  c)]"), "a b c")
);

// ── avg / lavg ────────────────────────────────────────────────────────────────

Deno.test("compat/list — avg of integers", async () =>
  assertEquals(await run("[avg(1 2 3 4 5)]"), "3")
);
Deno.test("compat/list — lavg alias", async () =>
  assertEquals(await run("[lavg(2 4 6)]"), "4")
);
Deno.test("compat/list — avg of single value", async () =>
  assertEquals(await run("[avg(7)]"), "7")
);
Deno.test("compat/list — avg of empty returns 0", async () =>
  assertEquals(await run("[avg()]"), "0")
);

// ── lmath ─────────────────────────────────────────────────────────────────────

Deno.test("compat/list — lmath sum", async () =>
  assertEquals(await run("[lmath(sum,1 2 3 4)]"), "10")
);
Deno.test("compat/list — lmath mul", async () =>
  assertEquals(await run("[lmath(mul,2 3 4)]"), "24")
);
Deno.test("compat/list — lmath max", async () =>
  assertEquals(await run("[lmath(max,3 1 4 1 5 9)]"), "9")
);
Deno.test("compat/list — lmath min", async () =>
  assertEquals(await run("[lmath(min,3 1 4 1 5)]"), "1")
);
Deno.test("compat/list — lmath mean", async () =>
  assertEquals(await run("[lmath(mean,1 2 3 4 5)]"), "3")
);
Deno.test("compat/list — lmath sub", async () =>
  assertEquals(await run("[lmath(sub,10 3 2)]"), "5")
);
Deno.test("compat/list — lmath div", async () =>
  assertEquals(await run("[lmath(div,24 2 3)]"), "4")
);
Deno.test("compat/list — lmath div by zero returns error", async () =>
  assertEquals(await run("[lmath(div,5 0)]"), "#-1 DIVISION BY ZERO")
);

// ── nummatch / nummember ──────────────────────────────────────────────────────

Deno.test("compat/list — nummatch counts exact matches", async () =>
  assertEquals(await run("[nummatch(a b a c a,a)]"), "3")
);
Deno.test("compat/list — nummember alias for nummatch", async () =>
  assertEquals(await run("[nummember(x y x,x)]"), "2")
);
Deno.test("compat/list — nummatch case-insensitive", async () =>
  assertEquals(await run("[nummatch(A a A,a)]"), "3")
);
Deno.test("compat/list — nummatch no match returns 0", async () =>
  assertEquals(await run("[nummatch(a b c,z)]"), "0")
);

// ── numpos ────────────────────────────────────────────────────────────────────

Deno.test("compat/list — numpos returns 1-indexed position", async () =>
  assertEquals(await run("[numpos(a b c,b)]"), "2")
);
Deno.test("compat/list — numpos no match returns 0", async () =>
  assertEquals(await run("[numpos(a b c,z)]"), "0")
);

// ── dice / die ────────────────────────────────────────────────────────────────

Deno.test("compat/list — die returns number in [1, sides]", async () => {
  const n = parseInt(await run("[die(6)]"), 10);
  assertEquals(n >= 1 && n <= 6, true);
});
Deno.test("compat/list — dice sum is in valid range", async () => {
  const n = parseInt(await run("[dice(3,6)]"), 10);
  assertEquals(n >= 3 && n <= 18, true);
});
Deno.test("compat/list — die(1) always returns 1", async () =>
  assertEquals(await run("[die(1)]"), "1")
);

// ── lsub ─────────────────────────────────────────────────────────────────────

Deno.test("compat/list — lsub removes elements preserving duplicates in l1", async () =>
  assertEquals(await run("[lsub(a b c b a,b)]"), "a c a")
);
Deno.test("compat/list — lsub removes all matching from l2", async () =>
  assertEquals(await run("[lsub(a b c d,b d)]"), "a c")
);

// ═══════════════════════════════════════════════════════════════════════════════
// OBJECT-COMPAT
// ═══════════════════════════════════════════════════════════════════════════════

// ── pronoun functions ─────────────────────────────────────────────────────────

Deno.test("compat/object — obj() returns objective pronoun for neutral (default)", async () =>
  assertEquals(await run("[obj(me)]"), "it")
);
Deno.test("compat/object — subj() returns subjective pronoun", async () =>
  assertEquals(await run("[subj(me)]"), "it")
);
Deno.test("compat/object — poss() returns possessive pronoun", async () =>
  assertEquals(await run("[poss(me)]"), "its")
);
Deno.test("compat/object — aposs() returns absolute possessive pronoun", async () =>
  assertEquals(await run("[aposs(me)]"), "its")
);

Deno.test("compat/object — obj() male pronoun", async () => {
  const male = makeActor({ state: { SEX: "male" } });
  const ctx = makeCtx({
    actor: male, executor: male, enactor: male.id,
    db: makeDb({ getAttribute: async (_obj, attr) => attr === "SEX" ? "male" : null }),
  });
  assertEquals(await runSoftcode("[obj(me)]", ctx), "him");
});
Deno.test("compat/object — subj() female pronoun", async () => {
  const female = makeActor({ state: { SEX: "female" } });
  const ctx = makeCtx({
    actor: female, executor: female, enactor: female.id,
    db: makeDb({ getAttribute: async (_obj, attr) => attr === "SEX" ? "female" : null }),
  });
  assertEquals(await runSoftcode("[subj(me)]", ctx), "she");
});
Deno.test("compat/object — poss() plural pronoun", async () => {
  const plural = makeActor({ state: { SEX: "plural" } });
  const ctx = makeCtx({
    actor: plural, executor: plural, enactor: plural.id,
    db: makeDb({ getAttribute: async (_obj, attr) => attr === "SEX" ? "plural" : null }),
  });
  assertEquals(await runSoftcode("[poss(me)]", ctx), "their");
});

// ── u2 / u2local aliases ─────────────────────────────────────────────────────

Deno.test("compat/object — u2 calls attribute with args (alias for u)", async () => {
  const actor = makeActor();
  const ctx = makeCtx({
    actor, executor: actor,
    db: makeDb({
      queryById: async (id) => id === actor.id ? actor : null,
      getAttribute: async (_obj, attr) => attr === "DOUBLE" ? "[mul(%0,2)]" : null,
    }),
  });
  assertEquals(await runSoftcode("[u2(me/DOUBLE,5)]", ctx), "10");
});

Deno.test("compat/object — u2local calls attribute in local register scope", async () => {
  const actor = makeActor();
  const ctx = makeCtx({
    actor, executor: actor,
    db: makeDb({
      queryById: async (id) => id === actor.id ? actor : null,
      getAttribute: async (_obj, attr) => attr === "ADDONE" ? "[add(%0,1)]" : null,
    }),
  });
  assertEquals(await runSoftcode("[u2local(me/ADDONE,9)]", ctx), "10");
});

// ── ueval ─────────────────────────────────────────────────────────────────────

Deno.test("compat/object — ueval evaluates attr with different actor", async () => {
  const actor  = makeActor({ id: "101" });
  const target = makeActor({ id: "202", name: "Bob" });
  const ctx = makeCtx({
    actor, executor: actor, enactor: actor.id,
    db: makeDb({
      queryById: async (id) => {
        if (id === "101") return actor;
        if (id === "202") return target;
        return null;
      },
      getAttribute: async (_obj, attr) => attr === "WHOAMI" ? "%N" : null,
    }),
  });
  // ueval(#202, me/WHOAMI) — runs WHOAMI with #202 (Bob) as actor → %N expands as Bob
  assertEquals(await runSoftcode("[ueval(#202,me/WHOAMI)]", ctx), "Bob");
});

Deno.test("compat/object — ueval returns NOT FOUND for missing actor", async () =>
  assertEquals(await run("[ueval(#99999,me/WHOAMI)]"), "#-1 NOT FOUND")
);

// ── set / wipe command wrappers ───────────────────────────────────────────────

Deno.test("compat/object — set() returns 1 and emits @set sentinel", async () => {
  const sent: string[] = [];
  const ctx = makeCtx({
    output: { send: (m: string) => { sent.push(m); }, roomBroadcast: () => {}, broadcast: () => {} },
  });
  const result = await runSoftcode("[set(me,TESTATTR=hello)]", ctx);
  assertEquals(result, "1");
  assertEquals(sent.some(m => m.includes("\x00atcmd\x00") && m.includes("@set")), true);
});

Deno.test("compat/object — wipe() returns 1 and emits @wipe sentinel", async () => {
  const sent: string[] = [];
  const ctx = makeCtx({
    output: { send: (m: string) => { sent.push(m); }, roomBroadcast: () => {}, broadcast: () => {} },
  });
  const result = await runSoftcode("[wipe(me,TEST*)]", ctx);
  assertEquals(result, "1");
  assertEquals(sent.some(m => m.includes("\x00atcmd\x00") && m.includes("@wipe")), true);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY / EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("compat/security — regedit invalid regex returns original string unchanged", async () => {
  // Use lookup() to avoid MUSH parser treating '[' as function-call opener
  const fn = (await import("../packages/mush/src/softcode/stdlib/index.ts")).lookup("regedit")!;
  assertEquals(await fn(["safe input", "[invalid", "x"], {} as never, []), "safe input");
});
Deno.test("compat/security — reswitch bad regex pattern is skipped safely", async () => {
  const fn = (await import("../packages/mush/src/softcode/stdlib/index.ts")).lookup("reswitch")!;
  assertEquals(await fn(["foo", "[bad", "oops", "default"], {} as never, []), "default");
});
Deno.test("compat/security — printf missing args uses empty string", async () => {
  // %%s → %s passed to printf; one arg provided, second is empty → "one and "
  assertEquals(await run("[printf(%%s and %%s,one)]"), "one and ");
});
Deno.test("compat/security — tr with empty string is identity", async () =>
  assertEquals(await run("[tr(abc,xyz,)]"), "")
);
Deno.test("compat/security — dice with 0 sides returns 0", async () =>
  assertEquals(await run("[dice(1,0)]"), "0")
);
Deno.test("compat/security — ueval respects max depth limit", async () => {
  const actor = makeActor();
  const ctx = makeCtx({
    actor, executor: actor,
    depth: 50,  // already at maxDepth
    db: makeDb({
      queryById: async (id) => id === actor.id ? actor : null,
      getAttribute: async () => "[ueval(me,me/RECURSE)]",
    }),
  });
  const result = await runSoftcode("[ueval(me,me/RECURSE)]", ctx);
  assertEquals(result, "#-1 TOO DEEP");
});
Deno.test("compat/security — strdistance large inputs don't throw", async () => {
  const long = "a".repeat(100);
  const result = await run(`[strdistance(${long},${long}b)]`);
  assertEquals(result, "1");
});

// ── ensure new functions don't shadow existing ones ───────────────────────────

Deno.test("compat/no-shadow — setdiff still works after listdiff alias", async () =>
  assertEquals(await run("[setdiff(a b c,b)]"), "a c")
);
Deno.test("compat/no-shadow — setinter still works after listinter alias", async () =>
  assertEquals(await run("[setinter(a b c,b c d)]"), "b c")
);
Deno.test("compat/no-shadow — sort still works after sortlist alias", async () =>
  assertEquals(await run("[sort(c a b)]"), "a b c")
);
Deno.test("compat/no-shadow — first still works after shift alias", async () =>
  assertEquals(await run("[first(a b c)]"), "a")
);
Deno.test("compat/no-shadow — reverse still works after flip alias", async () =>
  assertEquals(await run("[reverse(hello)]"), "olleh")
);
Deno.test("compat/no-shadow — ord still works after asc alias", async () =>
  assertEquals(await run("[ord(A)]"), "65")
);
