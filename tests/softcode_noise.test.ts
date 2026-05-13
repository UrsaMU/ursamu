/**
 * tests/softcode_noise.test.ts
 *
 * Tests for coherent noise stdlib: perlin1/2/3, simplex2, worley2,
 * fbm2, ridged2, noisegrid, noiseseed. Exercised through the real
 * UrsaMU softcode engine.
 */
import { assert, assertEquals } from "@std/assert";
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

function makeCtx(): UrsaEvalContext {
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
    maxOutputLen: 1_000_000,
    deadline:     Date.now() + 30_000,
    db:           makeDb(),
    output:       noOutput,
    _engine:      softcodeEngine,
  };
}

const run = (code: string) => runSoftcode(code, makeCtx());
const runNum = async (code: string) => parseFloat(await run(code));

// ── determinism ─────────────────────────────────────────────────────────

Deno.test("perlin2 — determinism: same (x,y,seed) → same output", async () => {
  const a = await run("[perlin2(1.5, 2.5, 42)]");
  const b = await run("[perlin2(1.5, 2.5, 42)]");
  const c = await run("[perlin2(1.5, 2.5, 42)]");
  assertEquals(a, b);
  assertEquals(b, c);
});

Deno.test("simplex2 — determinism", async () => {
  const a = await run("[simplex2(3.14, 2.71, 7)]");
  const b = await run("[simplex2(3.14, 2.71, 7)]");
  assertEquals(a, b);
});

Deno.test("worley2 — determinism", async () => {
  const a = await run("[worley2(0.3, 0.7, 99)]");
  const b = await run("[worley2(0.3, 0.7, 99)]");
  assertEquals(a, b);
});

// ── seed independence ──────────────────────────────────────────────────

Deno.test("perlin2 — different seeds → mostly different outputs", async () => {
  let differ = 0;
  for (let i = 0; i < 100; i++) {
    const x = i * 0.37 + 0.01;
    const y = i * 0.61 + 0.02;
    const a = await runNum(`[perlin2(${x}, ${y}, 1)]`);
    const b = await runNum(`[perlin2(${x}, ${y}, 999)]`);
    if (a !== b) differ++;
  }
  assert(differ >= 90, `expected >=90 differing samples, got ${differ}`);
});

// ── output range ───────────────────────────────────────────────────────

Deno.test("perlin2 — 1000 samples in [-1, 1]", async () => {
  for (let i = 0; i < 1000; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const v = await runNum(`[perlin2(${x}, ${y}, 7)]`);
    assert(v >= -1 && v <= 1, `perlin2 out of range: ${v} at (${x},${y})`);
  }
});

Deno.test("perlin1 — 200 samples in [-1, 1]", async () => {
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 100;
    const v = await runNum(`[perlin1(${x}, 7)]`);
    assert(v >= -1 && v <= 1, `perlin1 out of range: ${v}`);
  }
});

Deno.test("perlin3 — 200 samples in [-1, 1]", async () => {
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const z = Math.random() * 100;
    const v = await runNum(`[perlin3(${x}, ${y}, ${z}, 7)]`);
    assert(v >= -1 && v <= 1, `perlin3 out of range: ${v}`);
  }
});

Deno.test("simplex2 — 1000 samples in [-1, 1]", async () => {
  for (let i = 0; i < 1000; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const v = await runNum(`[simplex2(${x}, ${y}, 11)]`);
    assert(v >= -1 && v <= 1, `simplex2 out of range: ${v}`);
  }
});

Deno.test("fbm2 — 1000 samples in [-1, 1] (normalized)", async () => {
  for (let i = 0; i < 1000; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const v = await runNum(`[fbm2(${x}, ${y}, 4, 0.5, 7)]`);
    assert(v >= -1 && v <= 1, `fbm2 out of range: ${v}`);
  }
});

Deno.test("ridged2 — 1000 samples in [-1, 1]", async () => {
  for (let i = 0; i < 1000; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const v = await runNum(`[ridged2(${x}, ${y}, 4, 0.5, 7)]`);
    assert(v >= -1 && v <= 1, `ridged2 out of range: ${v}`);
  }
});

Deno.test("worley2 — outputs are non-negative distances", async () => {
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const v = await runNum(`[worley2(${x}, ${y}, 5)]`);
    assert(v >= 0, `worley2 negative: ${v}`);
  }
});

// ── continuity ─────────────────────────────────────────────────────────

Deno.test("perlin2 — smooth gradient (|f(x,y)-f(x+eps,y)| < 0.1)", async () => {
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * 10;
    const y = Math.random() * 10;
    const a = await runNum(`[perlin2(${x}, ${y}, 3)]`);
    const b = await runNum(`[perlin2(${x + 0.001}, ${y}, 3)]`);
    assert(Math.abs(a - b) < 0.1, `discontinuity: ${a} vs ${b}`);
  }
});

// ── noisegrid ──────────────────────────────────────────────────────────

Deno.test("noisegrid — returns w*h space-separated values", async () => {
  const r = await run("[noisegrid(42, 10, 8, 0.1)]");
  const parts = r.split(" ");
  assertEquals(parts.length, 80);
  for (const p of parts) {
    const n = parseFloat(p);
    assert(!isNaN(n), `non-numeric value: ${p}`);
  }
});

Deno.test("noisegrid — DoS clamp: 1000x1000 returns ≤10000 cells", async () => {
  const r = await run("[noisegrid(0, 1000, 1000, 0.1)]");
  const parts = r.split(" ");
  assert(parts.length <= 10_000, `clamp failed: ${parts.length} cells`);
  assert(parts.length > 0, "clamp returned empty");
});

Deno.test("noisegrid — simplex2 fn dispatch", async () => {
  const r = await run("[noisegrid(1, 4, 4, 0.2, simplex2)]");
  assertEquals(r.split(" ").length, 16);
});

Deno.test("noisegrid — worley2 fn dispatch", async () => {
  const r = await run("[noisegrid(1, 4, 4, 0.2, worley2)]");
  assertEquals(r.split(" ").length, 16);
});

Deno.test("noisegrid — unknown fn defaults to perlin2 (fail-soft)", async () => {
  const a = await run("[noisegrid(1, 4, 4, 0.2, bogus)]");
  const b = await run("[noisegrid(1, 4, 4, 0.2, perlin2)]");
  assertEquals(a, b);
});

// ── noiseseed ──────────────────────────────────────────────────────────

Deno.test("noiseseed — same seed → same subsequent output", async () => {
  await run("[noiseseed(123)]");
  const a = await run("[perlin2(0.5, 0.5)]");
  await run("[noiseseed(456)]");
  const b = await run("[perlin2(0.5, 0.5)]");
  await run("[noiseseed(123)]");
  const c = await run("[perlin2(0.5, 0.5)]");
  assertEquals(a, c);
  assert(a !== b, "different seeds should produce different output");
});

// ── performance smoke ──────────────────────────────────────────────────

Deno.test("perlin2 — single call < 50ms (cold-start budget)", async () => {
  const start = performance.now();
  await run("[perlin2(0, 0, 1)]");
  const elapsed = performance.now() - start;
  assert(elapsed < 50, `perlin2 too slow: ${elapsed}ms`);
});

Deno.test("noisegrid — 50x50 < 500ms", async () => {
  const start = performance.now();
  await run("[noisegrid(0, 50, 50, 0.1)]");
  const elapsed = performance.now() - start;
  assert(elapsed < 500, `noisegrid 50x50 too slow: ${elapsed}ms`);
});
