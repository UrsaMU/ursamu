/**
 * Tests for softcode functions needed by the Anomaly Jobs installer:
 * itext, inum, elist, align, hasattrval
 */
import { assertEquals } from "@std/assert";
import { runSoftcode, softcodeEngine } from "../src/services/Softcode/ursamu-engine.ts";
import type { UrsaEvalContext } from "../src/services/Softcode/ursamu-context.ts";

const ACTOR = {
  id: "1", name: "Alice",
  flags: new Set(["player", "connected"]),
  state: {}, contents: [], location: "0",
};

function makeCtx(overrides: Partial<UrsaEvalContext> = {}): UrsaEvalContext {
  return {
    enactor: ACTOR.id, actor: ACTOR, executor: ACTOR, caller: null,
    args: [], registers: new Map(), iterStack: [],
    depth: 0, maxDepth: 50, maxOutputLen: 65_536,
    deadline: Date.now() + 5_000,
    db: {
      getAttribute: async () => null,
      queryById: async () => null, queryByName: async () => null,
      lcon: async () => [], lwho: async () => [], lattr: async () => [],
      getTagById: async () => null, getPlayerTagById: async () => null,
      lsearch: async () => [], children: async () => [],
      lchannels: async () => "", channelsFor: async () => "",
      mailCount: async () => 0, queueLength: async () => 0,
      getIdleSecs: async () => 0, getUserFn: async () => null,
    },
    output: { send() {}, roomBroadcast() {}, broadcast() {} },
    _engine: softcodeEngine,
    ...overrides,
  };
}

const run = (code: string, overrides?: Partial<UrsaEvalContext>) =>
  runSoftcode(code, makeCtx(overrides));

// ── itext ────────────────────────────────────────────────────────────────────

Deno.test("jobs/itext — itext(0) returns current iter item", async () => {
  assertEquals(await run("[iter(a b c,itext(0))]"), "a b c");
});

Deno.test("jobs/itext — itext(0) in nested iter returns innermost item", async () => {
  // nested iter: outer iterates x y, inner iterates 1 2; itext(0)=inner, itext(1)=outer
  const result = await run("[iter(x y,iter(1 2,[itext(1)][itext(0)]))]");
  assertEquals(result, "1x 2x 1y 2y");
});

Deno.test("jobs/itext — itext returns empty string when not in iter", async () => {
  assertEquals(await run("[itext(0)]"), "");
});

// ── inum ─────────────────────────────────────────────────────────────────────

Deno.test("jobs/inum — inum(0) returns 1-based position", async () => {
  assertEquals(await run("[iter(a b c,inum(0))]"), "1 2 3");
});

// ── elist ────────────────────────────────────────────────────────────────────

Deno.test("jobs/elist — three items get Oxford comma", async () => {
  assertEquals(await run("[elist(a b c,and)]"), "a, b, and c");
});

Deno.test("jobs/elist — two items use conjunction without comma", async () => {
  assertEquals(await run("[elist(a b,and)]"), "a and b");
});

Deno.test("jobs/elist — single item returns as-is", async () => {
  assertEquals(await run("[elist(a,and)]"), "a");
});

Deno.test("jobs/elist — empty list returns empty string", async () => {
  assertEquals(await run("[elist(,and)]"), "");
});

Deno.test("jobs/elist — custom conjunction", async () => {
  assertEquals(await run("[elist(a b c,or)]"), "a, b, or c");
});

// ── align ────────────────────────────────────────────────────────────────────

Deno.test("jobs/align — left-justified column", async () => {
  assertEquals(await run("[align(5,AB)]"), "AB   ");
});

Deno.test("jobs/align — right-justified column (negative width)", async () => {
  assertEquals(await run("[align(-5,AB)]"), "   AB");
});

Deno.test("jobs/align — two columns", async () => {
  assertEquals(await run("[align(5 -5,AB,XY)]"), "AB      XY");
});

Deno.test("jobs/align — truncates when text exceeds width", async () => {
  assertEquals(await run("[align(3,ABCDE)]"), "ABC");
});

// ── hasattrval ───────────────────────────────────────────────────────────────

Deno.test("jobs/hasattrval — returns 0 when attr missing", async () => {
  assertEquals(await run("[hasattrval(me,DESC)]"), "0");
});

Deno.test("jobs/hasattrval — returns 1 when attr present and non-empty", async () => {
  const ctx = makeCtx({
    db: {
      getAttribute: async (_obj, attr) => attr === "DESC" ? "A description." : null,
      queryById: async () => null, queryByName: async () => null,
      lcon: async () => [], lwho: async () => [], lattr: async () => [],
      getTagById: async () => null, getPlayerTagById: async () => null,
      lsearch: async () => [], children: async () => [],
      lchannels: async () => "", channelsFor: async () => "",
      mailCount: async () => 0, queueLength: async () => 0,
      getIdleSecs: async () => 0, getUserFn: async () => null,
    },
  });
  assertEquals(await runSoftcode("[hasattrval(me,DESC)]", ctx), "1");
});

Deno.test("jobs/hasattrval — returns 0 when attr is empty string", async () => {
  const ctx = makeCtx({
    db: {
      getAttribute: async (_obj, attr) => attr === "DESC" ? "" : null,
      queryById: async () => null, queryByName: async () => null,
      lcon: async () => [], lwho: async () => [], lattr: async () => [],
      getTagById: async () => null, getPlayerTagById: async () => null,
      lsearch: async () => [], children: async () => [],
      lchannels: async () => "", channelsFor: async () => "",
      mailCount: async () => 0, queueLength: async () => 0,
      getIdleSecs: async () => 0, getUserFn: async () => null,
    },
  });
  assertEquals(await runSoftcode("[hasattrval(me,DESC)]", ctx), "0");
});
