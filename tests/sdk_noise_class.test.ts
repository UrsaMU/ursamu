/**
 * Per-instance Noise class — v2.5.2 (closes #148).
 *
 * Verifies that two `Noise(seed)` instances don't interfere with each other
 * via the module-level PERM singleton, and that an instance's PERM survives
 * arbitrary calls to the singleton `seedNoise()` between samples.
 */
import { assertEquals, assert } from "@std/assert";
import {
  createNoise,
  perlin2, seedNoise, buildPerm,
} from "../src/services/Softcode/stdlib/noise.ts";

Deno.test("Noise: createNoise(42) is deterministic across instances", () => {
  const a = createNoise(42);
  const b = createNoise(42);
  for (let i = 0; i < 50; i++) {
    assertEquals(a.perlin2(i * 0.1, i * 0.13), b.perlin2(i * 0.1, i * 0.13));
    assertEquals(a.simplex2(i * 0.1, i * 0.13), b.simplex2(i * 0.1, i * 0.13));
  }
});

Deno.test("Noise: different seeds → different streams", () => {
  const a = createNoise(42);
  const b = createNoise(99);
  let differ = 0;
  // Sample off-lattice (avoid integer-aligned coords where noise pins to 0)
  for (let i = 0; i < 100; i++) {
    if (Math.abs(a.perlin2(i * 0.1 + 0.37, i * 0.13 + 0.41) -
                 b.perlin2(i * 0.1 + 0.37, i * 0.13 + 0.41)) > 1e-9) differ++;
  }
  assert(differ >= 90, `expected ≥90% differing samples, got ${differ}/100`);
});

Deno.test("Noise: instance survives singleton seedNoise() between samples", () => {
  const n = createNoise(42);
  const baseline = n.perlin2(0.5, 0.5);
  // Stomp the singleton — should not affect the instance.
  seedNoise(99);
  const after = n.perlin2(0.5, 0.5);
  assertEquals(baseline, after);
  // And the singleton remains seeded to 99
  assert(Math.abs(perlin2(0.5, 0.5)) <= 1);
});

Deno.test("Noise: instance vs singleton with same seed produce same output", async () => {
  const { simplex2 } = await import("../src/services/Softcode/stdlib/noise.ts");
  const n = createNoise(42);
  seedNoise(42);
  assertEquals(n.perlin2(0.5, 0.5), perlin2(0.5, 0.5));
  assertEquals(n.simplex2(0.7, 1.3), simplex2(0.7, 1.3));
});

Deno.test("Noise: setSeed reshuffles in place; getSeed reports it", () => {
  const n = createNoise(42);
  assertEquals(n.getSeed(), 42);
  const before = n.perlin2(0.5, 0.5);
  n.setSeed(99);
  assertEquals(n.getSeed(), 99);
  const after = n.perlin2(0.5, 0.5);
  assert(Math.abs(before - after) > 1e-9, "expected different output after reseed");
  // Back to 42 → reproduces original sequence
  n.setSeed(42);
  assertEquals(n.perlin2(0.5, 0.5), before);
});

Deno.test("Noise: output range [-1, 1] for perlin/simplex over 500 samples", () => {
  const n = createNoise(42);
  for (let i = 0; i < 500; i++) {
    const x = (i * 1.123) % 1000;
    const y = (i * 2.456) % 1000;
    const p = n.perlin2(x, y);
    const s = n.simplex2(x, y);
    assert(p >= -1 && p <= 1, `perlin2 out of range at ${i}: ${p}`);
    assert(s >= -1 && s <= 1, `simplex2 out of range at ${i}: ${s}`);
  }
});

Deno.test("Noise.grid: returns w*h numeric array; clamps at MAX_LEN", () => {
  const n = createNoise(42);
  const small = n.grid(10, 5, 0.1);
  assertEquals(small.length, 50);
  for (const v of small) assert(typeof v === "number");
  const huge = n.grid(1000, 1000, 0.1);
  assert(huge.length <= 10_000, `grid clamp failed: ${huge.length}`);
});

Deno.test("Noise.grid: per-instance grid doesn't mutate singleton", () => {
  seedNoise(7);
  const singletonBefore = perlin2(0.5, 0.5);
  const n = createNoise(42);
  n.grid(20, 20, 0.1);
  const singletonAfter = perlin2(0.5, 0.5);
  assertEquals(singletonBefore, singletonAfter,
    "Noise.grid() must not stomp the module PERM");
});

Deno.test("Noise: fbm2/ridged2 work per-instance and stay in [-1,1]", () => {
  const n = createNoise(42);
  for (let i = 0; i < 200; i++) {
    const f = n.fbm2(i * 0.1, i * 0.13, 4, 0.5);
    const r = n.ridged2(i * 0.1, i * 0.13, 4, 0.5);
    assert(f >= -1.0001 && f <= 1.0001, `fbm2 out of range: ${f}`);
    assert(r >= -1.0001 && r <= 1.0001, `ridged2 out of range: ${r}`);
  }
});

Deno.test("buildPerm: deterministic, 512 bytes, mirrors lower 256", () => {
  const a = buildPerm(42);
  const b = buildPerm(42);
  assertEquals(a.length, 512);
  for (let i = 0; i < 512; i++) assertEquals(a[i], b[i]);
  for (let i = 0; i < 256; i++) assertEquals(a[i], a[i + 256]);
});

Deno.test("Noise: 1000 concurrent-style interleaved calls between two instances", () => {
  // Simulates two plugins calling noise in rapid alternation. Each instance's
  // output must be independent of the other's calls.
  const a = createNoise(11);
  const b = createNoise(22);
  // Capture each instance's pure sequence
  const aPure: number[] = [];
  const bPure: number[] = [];
  for (let i = 0; i < 100; i++) {
    aPure.push(a.perlin2(i * 0.1, 0));
    bPure.push(b.perlin2(i * 0.1, 0));
  }
  // Now do the same calls interleaved with each other AND singleton stomps
  const a2 = createNoise(11);
  const b2 = createNoise(22);
  for (let i = 0; i < 100; i++) {
    seedNoise(i * 7);                        // stomp the singleton
    assertEquals(a2.perlin2(i * 0.1, 0), aPure[i], `a drift at ${i}`);
    seedNoise(i * 13);                       // stomp again
    assertEquals(b2.perlin2(i * 0.1, 0), bPure[i], `b drift at ${i}`);
  }
});
