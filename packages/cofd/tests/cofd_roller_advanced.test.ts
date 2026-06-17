import { assertEquals, assert } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { executeRoll } from "../cofd.ts";

describe("CoFD Advanced Roller — n-again and rote", () => {
  it("preserves 10-again default behavior (executeRoll(pool) with no opts)", () => {
    // 10-again default: every 10 must trigger one additional die.
    // The simplest invariant: count of 10s in rolls = number of "extra" dice beyond pool.
    // Each 10 grants one explosion die; that die is also part of `rolls`.
    for (let trial = 0; trial < 25; trial++) {
      const pool = 10;
      const result = executeRoll(pool);
      assertEquals(result.again, 10);
      assertEquals(result.rote, false);
      assertEquals(result.isChanceDie, false);
      assert(result.rolls.length >= pool);
      // Successes equal count of dice >= 8.
      const expected = result.rolls.filter(r => r >= 8).length;
      assertEquals(result.successes, expected);
      // Sanity: rolls beyond the initial pool count should equal
      // the count of dice (anywhere in rolls except the last wave) that were 10.
      // Equivalently: every 10 in the rolls except possibly the very last batch
      // should have produced an extra die. We just assert length consistency:
      // rolls.length === pool + (number of 10s that themselves rolled, which equals
      // total 10s in `rolls`). Because every 10 explodes, and chains propagate,
      // the count of explosion dice equals the count of 10s in `rolls`.
      const tens = result.rolls.filter(r => r === 10).length;
      assertEquals(result.rolls.length, pool + tens);
    }
  });

  it("9-again: dice showing 9 generate an extra die (and count as a success)", () => {
    // Roll until we observe a 9 in the initial pool, then assert the chain expanded.
    let observed = false;
    for (let trial = 0; trial < 200 && !observed; trial++) {
      const pool = 8;
      const result = executeRoll(pool, { again: 9 });
      assertEquals(result.again, 9);
      assertEquals(result.rote, false);

      // Under 9-again, total explosion dice = count of (9s + 10s) anywhere in rolls.
      const triggers = result.rolls.filter(r => r >= 9).length;
      assertEquals(result.rolls.length, pool + triggers);

      // Successes are still dice >= 8.
      const expectedSuccesses = result.rolls.filter(r => r >= 8).length;
      assertEquals(result.successes, expectedSuccesses);

      // The 9 itself counts as a success — not separate from the reroll.
      if (result.rolls.slice(0, pool).some(r => r === 9)) {
        observed = true;
        // length must exceed the initial pool because at least one 9 exploded.
        assert(result.rolls.length > pool, "9 should have triggered an explosion");
      }
    }
    assert(observed, "expected to observe a 9 in the initial pool across 200 trials of pool 8");
  });

  it("8-again: dice showing 8 generate an extra die (and count as a success)", () => {
    let observed = false;
    for (let trial = 0; trial < 200 && !observed; trial++) {
      const pool = 8;
      const result = executeRoll(pool, { again: 8 });
      assertEquals(result.again, 8);

      // Under 8-again, every 8/9/10 explodes.
      const triggers = result.rolls.filter(r => r >= 8).length;
      assertEquals(result.rolls.length, pool + triggers);

      // Successes are dice >= 8.
      const expectedSuccesses = result.rolls.filter(r => r >= 8).length;
      assertEquals(result.successes, expectedSuccesses);

      if (result.rolls.slice(0, pool).some(r => r === 8)) {
        observed = true;
        assert(result.rolls.length > pool, "8 should have triggered an explosion");
      }
    }
    assert(observed, "expected to observe an 8 in the initial pool across 200 trials of pool 8");
  });

  it("rote: rerolls at most one extra die per initial failure (1-7)", () => {
    for (let trial = 0; trial < 20; trial++) {
      const pool = 5;
      const result = executeRoll(pool, { rote: true });
      assertEquals(result.rote, true);
      assertEquals(result.again, 10);
      assert(result.roteRerolls !== undefined);
      assert(result.roteRerolls!.length <= pool, "rote rerolls cannot exceed initial pool size");
      // Successes still equal dice >= 8 across all rolls.
      const expected = result.rolls.filter(r => r >= 8).length;
      assertEquals(result.successes, expected);
    }
  });

  it("rote does not double-apply: rote rerolls do not themselves trigger another rote", () => {
    // With 10-again + rote: number of rote rerolls equals number of initial failures.
    // The total `rolls.length` = initial pool + 10-again explosions from initial wave
    // + rote rerolls + 10-again explosions from rote rerolls. Even if a rote reroll
    // comes up as a failure (1-7), it must NOT be rerolled.
    let observed = false;
    for (let trial = 0; trial < 50 && !observed; trial++) {
      const pool = 10;
      const result = executeRoll(pool, { rote: true });
      const initial = result.rolls.slice(0, pool);
      const initialFailures = initial.filter(r => r < 8).length;
      // The rote reroll batch size must exactly equal initial failures.
      assertEquals(result.roteRerolls!.length, initialFailures);
      // If any rote reroll itself was a failure, confirm no further rerolls occurred:
      // total rolls accounted for:
      //   pool (initial)
      // + tens from initial wave (each explodes once, and chain)
      // + roteRerolls.length
      // + tens from rote rerolls (chain)
      const initialTens = result.rolls.filter(r => r === 10).length;
      // total tens across rolls equals total explosions across everything.
      // length = pool + initialTens (since every 10 explodes once across the whole transcript)
      //   + roteRerolls.length
      // We can't separate explosion sources from each other easily — use the
      // invariant: rolls.length === pool + roteRerolls.length + (count of 10s in rolls).
      assertEquals(
        result.rolls.length,
        pool + result.roteRerolls!.length + initialTens
      );

      // Confirm at least one rote reroll was a failure in one trial → no further reroll happened.
      if (result.roteRerolls!.some(r => r < 8)) {
        observed = true;
      }
    }
    assert(observed, "expected at least one rote reroll to be a failure across 50 trials");
  });

  it("chance die ignores rote/9-again/8-again: pool of 0 rolls exactly 1 die", () => {
    for (let trial = 0; trial < 20; trial++) {
      const result = executeRoll(0, { again: 8, rote: true });
      assertEquals(result.isChanceDie, true);
      assertEquals(result.rolls.length, 1);
      // Echo: chance die ignores options, so the result reports defaults.
      assertEquals(result.again, 10);
      assertEquals(result.rote, false);
      // No rote rerolls on a chance die.
      assert(result.roteRerolls === undefined || result.roteRerolls.length === 0);
    }
  });
});
