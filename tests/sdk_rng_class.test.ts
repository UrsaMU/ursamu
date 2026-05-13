import { assert, assertEquals, assertNotStrictEquals } from "jsr:@std/assert@^1";
import { createRng, Rng } from "../src/services/Softcode/stdlib/rng.ts";

Deno.test("createRng(42) produces deterministic sequence", () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 3; i++) {
    assertEquals(a.random(), b.random());
  }
});

Deno.test("Two Rng(42) instances are independent", () => {
  const a = new Rng(42);
  const b = new Rng(42);
  const seqA = [a.random(), a.random(), a.random()];
  const b0 = b.random();
  const b1 = b.random();
  const b2 = b.random();
  assertEquals(seqA, [b0, b1, b2]);
});

Deno.test("Rng(null) returns numbers in [0,1)", () => {
  const r = new Rng(null);
  for (let i = 0; i < 100; i++) {
    const v = r.random();
    assert(v >= 0 && v < 1);
  }
});

Deno.test("setSeed(null) returns to Math.random()", () => {
  const r = new Rng(42);
  r.random();
  r.setSeed(null);
  const v = r.random();
  assert(v >= 0 && v < 1);
  assertEquals(r.getSeed(), null);
});

Deno.test("rand(0,10) over 1000 samples stays in [0,10]", () => {
  const r = new Rng(123);
  for (let i = 0; i < 1000; i++) {
    const v = r.rand(0, 10);
    assert(Number.isInteger(v));
    assert(v >= 0 && v <= 10);
  }
});

Deno.test("rand handles negative ranges", () => {
  const r = new Rng(7);
  for (let i = 0; i < 500; i++) {
    const v = r.rand(-5, 5);
    assert(v >= -5 && v <= 5);
    assert(Number.isInteger(v));
  }
});

Deno.test("rand(7,7) is degenerate", () => {
  const r = new Rng(1);
  for (let i = 0; i < 20; i++) assertEquals(r.rand(7, 7), 7);
});

Deno.test("pick returns one of provided; covers all values", () => {
  const r = new Rng(99);
  const items = ["a", "b", "c"];
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const v = r.pick(items)!;
    assert(items.includes(v));
    seen.add(v);
  }
  assertEquals(seen.size, 3);
});

Deno.test("pick([]) returns undefined", () => {
  const r = new Rng(1);
  assertEquals(r.pick([]), undefined);
});

Deno.test("shuffle returns same elements, doesn't mutate input", () => {
  const r = new Rng(42);
  const input = [1, 2, 3, 4, 5];
  const copy = input.slice();
  const out = r.shuffle(input);
  assertEquals(input, copy);
  assertEquals(out.length, 5);
  assertEquals(out.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assertNotStrictEquals(out, input);
});

Deno.test("shuffle is deterministic with same seed", () => {
  const a = createRng(42).shuffle([1, 2, 3, 4, 5]);
  const b = createRng(42).shuffle([1, 2, 3, 4, 5]);
  assertEquals(a, b);
});

Deno.test("getSeed round-trip", () => {
  const r = new Rng(42);
  assertEquals(r.getSeed(), 42);
  r.setSeed(null);
  assertEquals(r.getSeed(), null);
  r.setSeed(7);
  assertEquals(r.getSeed(), 7);
});

Deno.test("Rng() with no args is unseeded", () => {
  const r = new Rng();
  assertEquals(r.getSeed(), null);
  const v = r.random();
  assert(v >= 0 && v < 1);
});
