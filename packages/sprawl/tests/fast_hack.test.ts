import { assertEquals, assert } from "@std/assert";
import {
  formatFastHackDice,
  maxFastHackDice,
  parsePoolDice,
  resolveFastHack,
  rollNetExploit,
} from "../engine/fast-hack.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

/** Deterministic rng from fixed 0–1 sequence. */
function seqRng(vals: number[]): () => number {
  let i = 0;
  return () => vals[i++ % vals.length]!;
}

Deno.test("pool max is Cognition + RAM", OPTS, () => {
  assertEquals(maxFastHackDice(3, 2), 5);
  assertEquals(maxFastHackDice(0, 0), 1);
});

Deno.test("parsePoolDice reads dN tokens", OPTS, () => {
  const a = parsePoolDice(["d3", "+upgrade", "cam"]);
  assertEquals(a.dice, 3);
  assertEquals(a.rest, ["+upgrade", "cam"]);
  const b = parsePoolDice(["pool:4", "glitch"]);
  assertEquals(b.dice, 4);
});

Deno.test("fast hack success when total > DS", OPTS, () => {
  // three 6s → sum 18 + bonus 2 = 20 > 12
  const rng = seqRng([0.99, 0.99, 0.99]);
  const r = resolveFastHack({
    cognition: 2,
    ram: 1,
    diceCount: 3,
    bonuses: 2,
    ds: 12,
  }, rng);
  assertEquals(r.poolMax, 3);
  assertEquals(r.diceCount, 3);
  assertEquals(r.diceSum, 18);
  assertEquals(r.total, 20);
  assert(r.success);
  assertEquals(r.sixes, 3);
  assertEquals(r.ones, 0);
  assertEquals(r.exploits.length, 3);
  assertEquals(r.responses.length, 0);
});

Deno.test("fast hack fail auto system response", OPTS, () => {
  // three 1s → sum 3 + 0 = 3 not > 10
  const rng = seqRng([0, 0, 0, 0, 0, 0, 0, 0]);
  const r = resolveFastHack({
    cognition: 2,
    ram: 1,
    diceCount: 3,
    bonuses: 0,
    ds: 10,
  }, rng);
  assert(!r.success);
  assertEquals(r.ones, 3);
  // 3 ones + 1 fail auto
  assertEquals(r.responses.length, 4);
  assert(r.damageToSelf >= 1);
});

Deno.test("strict greater-than DS (tie fails)", OPTS, () => {
  // two 5s = 10 + 0, DS 10 → fail
  const rng = seqRng([0.8, 0.8, 0, 0]);
  const r = resolveFastHack({
    cognition: 1,
    ram: 1,
    diceCount: 2,
    bonuses: 0,
    ds: 10,
  }, rng);
  assertEquals(r.diceSum, 10);
  assertEquals(r.total, 10);
  assert(!r.success);
});

Deno.test("dice count clamped to pool max", OPTS, () => {
  const rng = seqRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  const r = resolveFastHack({
    cognition: 1,
    ram: 1,
    diceCount: 99,
    bonuses: 0,
    ds: 99,
  }, rng);
  assertEquals(r.poolMax, 2);
  assertEquals(r.diceCount, 2);
  assertEquals(r.kept.length, 2);
});

Deno.test("glitch keeps worst of expanded pool", OPTS, () => {
  // roll 2+1=3 dice: force 1,6,6 → keep worst 2 = 1,6
  const rng = seqRng([0, 0.99, 0.99]);
  const r = resolveFastHack({
    cognition: 2,
    ram: 0,
    diceCount: 2,
    bonuses: 0,
    ds: 20,
    glitch: 1,
  }, rng);
  assertEquals(r.mode, "glitch");
  assertEquals(r.rolled.length, 3);
  assertEquals(r.kept.length, 2);
  assertEquals(r.kept[0], 1);
  assert(r.kept.includes(6));
});

Deno.test("net exploit d66 table hit", OPTS, () => {
  const ex = rollNetExploit(() => 0);
  assertEquals(ex.roll, "11");
  assert(ex.name.length > 0);
});

Deno.test("formatFastHackDice shows faces", OPTS, () => {
  const rng = seqRng([0.99, 0.99]);
  const r = resolveFastHack({
    cognition: 1,
    ram: 1,
    diceCount: 2,
    bonuses: 0,
    ds: 1,
  }, rng);
  const s = formatFastHackDice(r);
  assert(s.includes("6"));
});
