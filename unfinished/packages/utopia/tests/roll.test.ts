import { assertEquals } from "@std/assert";
import { lockDv, resolveRoll } from "../src/roll.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function seq(nums: number[]): () => number {
  let i = 0;
  return () => {
    const n = nums[i] ?? 0.5;
    i += 1;
    return n;
  };
}

Deno.test("lockDv is 2d10 + danger d6s", OPTS, () => {
  // 0.95 → 10, 0.95 → 10, 0.5 → 4
  const dv = lockDv(1, seq([0.95, 0.95, 0.5]));
  assertEquals(dv, 24);
});

Deno.test("resolveRoll holds when total beats DV", OPTS, () => {
  const out = resolveRoll({
    skillDice: 0,
    danger: 0,
    lockedDv: 10,
    buyHitch: false,
    rng: seq([0.95, 0.95]),
  });
  assertEquals(out.total, 20);
  assertEquals(out.dv, 10);
  assertEquals(out.result, "holds");
  assertEquals(out.danger, 0);
});

Deno.test("resolveRoll fails when below DV", OPTS, () => {
  const out = resolveRoll({
    skillDice: 0,
    danger: 2,
    lockedDv: 18,
    buyHitch: false,
    rng: seq([0.05, 0.05]),
  });
  assertEquals(out.result, "fails");
  assertEquals(out.danger, 2);
});

Deno.test("buy hitch if danger <= 4", OPTS, () => {
  const out = resolveRoll({
    skillDice: 0,
    danger: 4,
    lockedDv: 18,
    buyHitch: true,
    rng: seq([0.05, 0.05]),
  });
  assertEquals(out.result, "hitch");
  assertEquals(out.danger, 5);
});

Deno.test("cannot buy hitch at danger 5", OPTS, () => {
  const out = resolveRoll({
    skillDice: 0,
    danger: 5,
    lockedDv: 18,
    buyHitch: true,
    rng: seq([0.05, 0.05]),
  });
  assertEquals(out.result, "fails");
  assertEquals(out.danger, 5);
});
