import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  perlin2,
  simplex2,
  worley2,
  fbm2,
  noiseGrid,
  seedNoise,
} from "../src/services/Softcode/stdlib/noise.ts";

Deno.test("perlin2: deterministic given seed", () => {
  seedNoise(42);
  const a = perlin2(0.5, 0.5);
  seedNoise(42);
  const b = perlin2(0.5, 0.5);
  assertEquals(a, b);
});

Deno.test("perlin2: output in [-1, 1] over 1000 samples", () => {
  seedNoise(7);
  for (let i = 0; i < 1000; i++) {
    const x = (i * 0.137) % 50;
    const y = (i * 0.271) % 50;
    const v = perlin2(x, y);
    assert(v >= -1 && v <= 1, `perlin2 out of range: ${v}`);
  }
});

Deno.test("perlin2: continuity (|Δ| < 0.1 at ε=0.001)", () => {
  seedNoise(123);
  const eps = 0.001;
  for (let i = 0; i < 50; i++) {
    const x = i * 0.3;
    const y = i * 0.7;
    const a = perlin2(x, y);
    const b = perlin2(x + eps, y + eps);
    assert(Math.abs(a - b) < 0.1, `discontinuity: ${a} → ${b}`);
  }
});

Deno.test("simplex2: range [-1, 1] over 500 samples", () => {
  seedNoise(11);
  for (let i = 0; i < 500; i++) {
    const v = simplex2(i * 0.11, i * 0.19);
    assert(v >= -1 && v <= 1, `simplex2 out of range: ${v}`);
  }
});

Deno.test("worley2: non-negative (distance)", () => {
  seedNoise(99);
  for (let i = 0; i < 200; i++) {
    const v = worley2(i * 0.13, i * 0.17);
    assert(v >= 0, `worley2 negative: ${v}`);
  }
});

Deno.test("fbm2: normalized range [-1, 1] (octaves=4, persistence=0.5)", () => {
  seedNoise(5);
  for (let i = 0; i < 500; i++) {
    const v = fbm2(i * 0.1, i * 0.13, 4, 0.5);
    assert(v >= -1 && v <= 1, `fbm2 out of range: ${v}`);
  }
});

Deno.test("noiseGrid: returns width*height numeric array", () => {
  const g = noiseGrid(1, 8, 6, 0.1);
  assertEquals(g.length, 48);
  assert(Array.isArray(g));
  assert(typeof g[0] === "number");
});

Deno.test("noiseGrid: DoS clamp to ≤ 10 000 entries", () => {
  const g = noiseGrid(0, 1000, 1000, 0.1);
  assert(g.length <= 10_000, `expected ≤ 10000, got ${g.length}`);
});

Deno.test("noiseGrid: unknown fn name → fail-soft to perlin2", () => {
  const g1 = noiseGrid(42, 4, 4, 0.1, "bogus" as unknown as "perlin2");
  seedNoise(42);
  const expected: number[] = [];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) expected.push(perlin2(i * 0.1, j * 0.1));
  }
  assertEquals(g1, expected);
});
