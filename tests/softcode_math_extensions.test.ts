/**
 * tests/softcode_math_extensions.test.ts
 *
 * Tests for v2.5.0 math/spatial/interpolation stdlib extensions —
 * extended trig/log, clamp, lerp family, distance helpers, bearing,
 * randseed determinism, and Unreal-style vector aliases.
 */
import { assertEquals, assertAlmostEquals } from "@std/assert";
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

const run  = (code: string) => runSoftcode(code, makeCtx());
const runF = async (code: string) => parseFloat(await run(code));

// ── extended trig / log ────────────────────────────────────────────────────

Deno.test("hypot — pythagorean triple", async () => {
  assertEquals(await run("[hypot(3,4)]"), "5");
});

Deno.test("hypot — variadic 3 args", async () => {
  assertAlmostEquals(await runF("[hypot(2,3,6)]"), 7, 1e-9);
});

Deno.test("cbrt — perfect cube", async () => {
  assertEquals(await run("[cbrt(27)]"), "3");
});

Deno.test("log2/log10/log1p/expm1 parity", async () => {
  assertEquals(await run("[log2(8)]"), "3");
  assertEquals(await run("[log10(1000)]"), "3");
  assertAlmostEquals(await runF("[log1p(0)]"), 0, 1e-12);
  assertAlmostEquals(await runF("[expm1(0)]"), 0, 1e-12);
});

Deno.test("hyperbolic trig parity", async () => {
  assertAlmostEquals(await runF("[sinh(0)]"), 0, 1e-12);
  assertAlmostEquals(await runF("[cosh(0)]"), 1, 1e-12);
  assertAlmostEquals(await runF("[tanh(0)]"), 0, 1e-12);
  assertAlmostEquals(await runF("[asinh(0)]"), 0, 1e-12);
  assertAlmostEquals(await runF("[acosh(1)]"), 0, 1e-12);
  assertAlmostEquals(await runF("[atanh(0)]"), 0, 1e-12);
});

// ── sign / clamp ───────────────────────────────────────────────────────────

Deno.test("sign — negative/zero/positive", async () => {
  assertEquals(await run("[sign(-7.5)]"), "-1");
  assertEquals(await run("[sign(0)]"), "0");
  assertEquals(await run("[sign(3.2)]"), "1");
});

Deno.test("clamp — below/inside/above", async () => {
  assertEquals(await run("[clamp(-5,0,10)]"), "0");
  assertEquals(await run("[clamp(5,0,10)]"), "5");
  assertEquals(await run("[clamp(99,0,10)]"), "10");
});

Deno.test("clamp — swapped bounds normalized", async () => {
  assertEquals(await run("[clamp(5,10,0)]"), "5");
  assertEquals(await run("[clamp(-1,10,0)]"), "0");
  assertEquals(await run("[clamp(99,10,0)]"), "10");
});

// ── interpolation ──────────────────────────────────────────────────────────

Deno.test("lerp — endpoints + midpoint + out-of-range", async () => {
  assertEquals(await run("[lerp(0,10,0)]"), "0");
  assertEquals(await run("[lerp(0,10,1)]"), "10");
  assertEquals(await run("[lerp(0,10,0.5)]"), "5");
  assertEquals(await run("[lerp(0,10,2)]"), "20"); // no clamping
});

Deno.test("inverselerp — basic and degenerate", async () => {
  assertEquals(await run("[inverselerp(0,10,5)]"), "0.5");
  const err = await run("[inverselerp(5,5,5)]");
  assertEquals(err.startsWith("#-1"), true);
});

Deno.test("remap — linear remap", async () => {
  assertEquals(await run("[remap(5,0,10,0,100)]"), "50");
  assertEquals(await run("[remap(0,0,1,-1,1)]"), "-1");
});

Deno.test("smoothstep — boundaries and midpoint", async () => {
  assertEquals(await run("[smoothstep(0,1,-1)]"), "0");
  assertEquals(await run("[smoothstep(0,1,2)]"), "1");
  assertEquals(await run("[smoothstep(0,1,0.5)]"), "0.5");
});

Deno.test("smootherstep — boundaries and midpoint", async () => {
  assertEquals(await run("[smootherstep(0,1,-1)]"), "0");
  assertEquals(await run("[smootherstep(0,1,2)]"), "1");
  assertEquals(await run("[smootherstep(0,1,0.5)]"), "0.5");
});

// ── spatial scalars ────────────────────────────────────────────────────────

Deno.test("dist2d / distsq2d parity", async () => {
  assertEquals(await run("[dist2d(0,0,3,4)]"), "5");
  assertEquals(await run("[distsq2d(0,0,3,4)]"), "25");
  assertEquals(await run("[dist2d(0,0,0,0)]"), "0");
  assertEquals(await run("[dist2d(-1,-1,2,3)]"), "5");
});

Deno.test("dist3d / distsq3d parity", async () => {
  assertEquals(await run("[dist3d(0,0,0,1,2,2)]"), "3");
  assertEquals(await run("[distsq3d(0,0,0,1,2,2)]"), "9");
});

Deno.test("manhattan / chebyshev", async () => {
  assertEquals(await run("[manhattan(0,0,3,4)]"), "7");
  assertEquals(await run("[chebyshev(0,0,3,4)]"), "4");
});

Deno.test("angle2d — returns radians", async () => {
  // (0,0) → (1,1) is 45° = pi/4
  assertAlmostEquals(await runF("[angle2d(0,0,1,1)]"), Math.PI / 4, 1e-9);
  // (0,0) → (1,0) is 0
  assertAlmostEquals(await runF("[angle2d(0,0,1,0)]"), 0, 1e-12);
});

Deno.test("bearing — MUSH compass (N=0, clockwise)", async () => {
  // due-N target (+Y) → 0°
  assertAlmostEquals(await runF("[bearing(0,0,0,1)]"), 0, 1e-9);
  // due-E target (+X) → 90°
  assertAlmostEquals(await runF("[bearing(0,0,1,0)]"), 90, 1e-9);
  // due-S → 180°
  assertAlmostEquals(await runF("[bearing(0,0,0,-1)]"), 180, 1e-9);
  // due-W → 270°
  assertAlmostEquals(await runF("[bearing(0,0,-1,0)]"), 270, 1e-9);
});

Deno.test("bearing — in [0, 360)", async () => {
  const v = await runF("[bearing(0,0,-1,-1)]");
  if (v < 0 || v >= 360) throw new Error(`bearing out of range: ${v}`);
});

// ── randseed determinism ───────────────────────────────────────────────────

Deno.test("randseed — same seed → same sequence", async () => {
  const a = await run("[randseed(42)][rand(1000000)] [rand(1000000)] [rand(1000000)]");
  const b = await run("[randseed(42)][rand(1000000)] [rand(1000000)] [rand(1000000)]");
  // Strip the leading "42" that randseed echoes back, then compare.
  assertEquals(a, b);
});

Deno.test("randseed — different seed differs", async () => {
  const a = await run("[randseed(42)][rand(1000000)] [rand(1000000)] [rand(1000000)]");
  const b = await run("[randseed(43)][rand(1000000)] [rand(1000000)] [rand(1000000)]");
  if (a === b) throw new Error("expected different sequences for different seeds");
});

Deno.test("randseed — seed 0 is valid", async () => {
  const a = await run("[randseed(0)][rand(100)]");
  const b = await run("[randseed(0)][rand(100)]");
  assertEquals(a, b);
});

Deno.test("randseed — get current seed", async () => {
  // Set then read back
  await run("[randseed(7)]");
  assertEquals(await run("[randseed()]"), "7");
});

// ── Unreal-style aliases ───────────────────────────────────────────────────

Deno.test("vsize / vsizesq", async () => {
  assertEquals(await run("[vsize(3 0 4)]"), "5");
  assertEquals(await run("[vsizesq(3 0 4)]"), "25");
});

Deno.test("vdistance / vdistsquared", async () => {
  assertEquals(await run("[vdistance(0 0 0,3 0 4)]"), "5");
  assertEquals(await run("[vdistsquared(0 0 0,3 0 4)]"), "25");
});

Deno.test("vlerp — component-wise", async () => {
  assertEquals(await run("[vlerp(0 0 0,10 20 30,0.5)]"), "5 10 15");
});

Deno.test("vclamp — component-wise", async () => {
  assertEquals(await run("[vclamp(-5 5 20,0,10)]"), "0 5 10");
});
