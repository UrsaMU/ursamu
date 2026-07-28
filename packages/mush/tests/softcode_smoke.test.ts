/**
 * Softcode smoke matrix — pure expressions via runSoftcodeSimple.
 * Guards stdlib categories used by layout, formats, and plugins.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { runSoftcodeSimple } from "../src/softcode/engine.ts";
import { entries, lookup } from "../src/softcode/stdlib/registry.ts";
// Side-effect: load stdlib registrations
import "../src/softcode/stdlib/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

async function sc(code: string): Promise<string> {
  return await runSoftcodeSimple(code, {
    actorId: "smoke_actor",
    executorId: "smoke_actor",
  });
}

Deno.test("softcode: stdlib registry is populated", OPTS, () => {
  const names = [...entries()].map(([n]) => n);
  assertEquals(names.length > 50, true);
  assertEquals(typeof lookup("add"), "function");
  assertEquals(typeof lookup("strlen"), "function");
  assertEquals(typeof lookup("if"), "function");
  assertEquals(typeof lookup("first"), "function");
});

Deno.test("softcode smoke: math", OPTS, async () => {
  assertEquals(await sc("[add(2,3)]"), "5");
  assertEquals(await sc("[sub(10,4)]"), "6");
  assertEquals(await sc("[mul(3,4)]"), "12");
  assertEquals(await sc("[div(15,3)]"), "5");
  assertEquals(await sc("[abs(-7)]"), "7");
  assertEquals(await sc("[max(1,9,3)]"), "9");
  assertEquals(await sc("[min(1,9,3)]"), "1");
  assertEquals(await sc("[eq(2,2)]"), "1");
  assertEquals(await sc("[neq(2,3)]"), "1");
  assertEquals(await sc("[gt(5,2)]"), "1");
  assertEquals(await sc("[lt(1,2)]"), "1");
});

Deno.test("softcode smoke: string", OPTS, async () => {
  assertEquals(await sc("[strlen(hello)]"), "5");
  assertEquals(await sc("[ucstr(hi)]"), "HI");
  assertEquals(await sc("[lcstr(HI)]"), "hi");
  assertEquals(await sc("[left(abcdef,3)]"), "abc");
  assertEquals(await sc("[right(abcdef,3)]"), "def");
  assertEquals(await sc("[mid(abcdef,2,3)]"), "cde");
  // cat joins with a single space (TinyMUX-style)
  assertEquals(await sc("[cat(a,b,c)]"), "a b c");
  assertEquals(await sc("[space(3)]"), "   ");
  assertEquals(await sc("[repeat(x,4)]"), "xxxx");
  assertEquals(await sc("[trim(  z  )]"), "z");
});

Deno.test("softcode smoke: list", OPTS, async () => {
  assertEquals(await sc("[words(a b c)]"), "3");
  assertEquals(await sc("[first(a b c)]"), "a");
  assertEquals(await sc("[rest(a b c)]"), "b c");
  assertEquals(await sc("[last(a b c)]"), "c");
  assertEquals(await sc("[extract(a b c,2)]"), "b");
  assertEquals(await sc("[member(a b c,b)]"), "2");
});

Deno.test("softcode smoke: logic and lit", OPTS, async () => {
  // if() is two-branch; use ifelse for else
  assertEquals(await sc("[if(1,yes)]"), "yes");
  assertEquals(await sc("[if(0,yes)]"), "");
  assertEquals(await sc("[ifelse(0,yes,no)]"), "no");
  assertEquals(await sc("[and(1,1)]"), "1");
  assertEquals(await sc("[or(0,1)]"), "1");
  assertEquals(await sc("[not(0)]"), "1");
  assertEquals(await sc("[lit(hello)]"), "hello");
  // chr avoids raw [ ] in source (parser delimiters)
  assertEquals(await sc("[chr(91)]"), "[");
  assertEquals(await sc("[chr(93)]"), "]");
})

Deno.test("softcode smoke: center and nest", OPTS, async () => {
  const centered = await sc("[center(X,5,=)]");
  assertStringIncludes(centered, "X");
  assertEquals(centered.length, 5);
  assertEquals(await sc("[add(mul(2,3),4)]"), "10");
  assertEquals(
    await sc("[if(eq(words(a b),2),ok,bad)]"),
    "ok",
  );
});

Deno.test("softcode smoke: registers setq/setr/r", OPTS, async () => {
  assertEquals(await sc("[setq(0,hello)][r(0)]"), "hello");
  assertEquals(await sc("[setr(1,world)]"), "world");
});

Deno.test("softcode smoke: percent args", OPTS, async () => {
  const out = await runSoftcodeSimple("[%0]-%1", {
    actorId: "smoke_actor",
    executorId: "smoke_actor",
    args: ["alpha", "beta"],
  });
  assertEquals(out, "alpha-beta");
});
