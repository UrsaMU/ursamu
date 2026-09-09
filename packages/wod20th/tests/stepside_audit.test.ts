// tests/stepside_audit.test.ts -- /tdd-audit security pass for +stepside / core/umbra.
//
// Exercises OWASP-style exploit vectors against the pure mechanic in
// core/umbra.ts plus the contract the +stepside command relies on. The
// command file itself gates non-WtA, zero-Gnosis, and accepts no
// user-controlled difficulty -- those are encoded here as regression
// guards (source inspection) plus mechanic-level assertions.
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import { DEFAULT_GAUNTLET, isInUmbra, stepSideways } from "../core/umbra.ts";
import { evaluateRoll, type IDiceRoll } from "../core/dice.ts";
import type { IWoDChar } from "../core/types.ts";

function mkChar(overrides: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "c1",
    playerId: "p1",
    splat: "wta",
    status: "approved",
    chargenStep: 6,
    concept: "test",
    attributePriority: ["", "", ""],
    attributes: {},
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {},
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 6,
    rage: 3,
    gnosis: 5,
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

/** Build a deterministic roller that returns a fixed dice set. */
function fixed(dice: number[]) {
  return (_pool: number, difficulty: number): IDiceRoll =>
    evaluateRoll(dice, difficulty, false);
}

// Read command source once for regression guards on hardened gates.
const STEPSIDE_SRC = await Deno.readTextFile(
  new URL("../commands/stepside.ts", import.meta.url),
);

describe("/tdd-audit +stepside / stepSideways", () => {
  // E-1: command gates non-WtA characters.
  it("E-1: +stepside command refuses non-WtA characters (source gate)", () => {
    // Hardened path -- regression guard. The command must reject
    // splat !== 'wta' before invoking any mechanic.
    assert(
      /char\.splat\s*!==\s*"wta"/.test(STEPSIDE_SRC),
      "+stepside must gate non-WtA splat before stepSideways()",
    );
    assert(
      /Only Garou \(WtA\) characters can step sideways\./.test(STEPSIDE_SRC),
      "+stepside must surface a WtA-only message",
    );
  });

  // E-2: failure/botch -> caller spends exactly 1 Gnosis, never more, never negative.
  it("E-2: failed/botched outcomes correspond to a single -1 Gnosis cost (command path)", () => {
    // The mechanic itself spends nothing; the command spends 1 via spendPool.
    // Assert command source uses spendPool(char, 'gnosis', 1) exactly.
    const m = STEPSIDE_SRC.match(/spendPool\(\s*char\s*,\s*"gnosis"\s*,\s*(\d+)\s*\)/);
    assert(m, "command must call spendPool(char, 'gnosis', N)");
    assertEquals(m![1], "1", "Gnosis cost on failure/botch must be exactly 1");
  });

  // E-3: command must not accept a user-supplied gauntlet/difficulty.
  it("E-3: command does not expose Gauntlet difficulty to caller (regression guard)", () => {
    // Source-level guard: stepSideways must receive its difficulty from a
    // server-side source -- the room's state.gauntlet (builder-set) clamped
    // to a safe range with DEFAULT_GAUNTLET as fallback. It must never read
    // from u.cmd.args[*]. A future regression that pipes user input would
    // let players trivially succeed.
    assert(
      /stepSideways\(\s*char\s*,\s*gauntlet\s*\)/.test(STEPSIDE_SRC),
      "command must pass its own gauntlet variable, not user input",
    );
    assert(
      /u\.here\?\.state\?\.gauntlet/.test(STEPSIDE_SRC),
      "gauntlet must be sourced from u.here.state.gauntlet (builder-set)",
    );
    assert(
      /DEFAULT_GAUNTLET/.test(STEPSIDE_SRC),
      "DEFAULT_GAUNTLET must remain the fallback when room is unset",
    );
    assert(
      !/u\.cmd\.args.*gauntlet/i.test(STEPSIDE_SRC),
      "command must NOT read gauntlet from user-supplied cmd args",
    );

    // Mechanic-level defense: evaluateRoll clamps difficulty into [2,10],
    // so even a pathological caller cannot make a 0/-1 difficulty roll succeed
    // on every die. Confirm with a deterministic roller.
    const char = mkChar({ inUmbra: false });
    const r = stepSideways(char, 0, fixed([2, 3, 4]));
    // diff clamps to 2 -> all of [2,3,4] succeed; that's the documented floor.
    assertEquals(r.roll.difficulty, 2);
    // And that's still bounded -- the function never returns successes
    // greater than dice length.
    assert(r.roll.netSuccesses <= 3);
  });

  // E-4: stepSideways must never mutate the character record.
  it("E-4: stepSideways does not mutate the character", () => {
    const char = mkChar({ inUmbra: false, gnosisCurrent: 5 });
    const before = JSON.stringify(char);
    stepSideways(char, DEFAULT_GAUNTLET, fixed([1, 1, 2]));
    stepSideways(char, DEFAULT_GAUNTLET, fixed([8, 9]));
    assertEquals(JSON.stringify(char), before, "character must be untouched");
  });

  // E-5: zero-Gnosis attempt is rejected at the command level (regression guard).
  it("E-5: command refuses attempts when Gnosis pool is <= 0", () => {
    assert(
      /!char\.gnosis\s*\|\|\s*char\.gnosis\s*<=\s*0/.test(STEPSIDE_SRC),
      "command must gate zero/missing Gnosis before invoking the mechanic",
    );
    // Mechanic-level: even if the gate were bypassed, the pool floors at 1
    // so we never roll an empty array (which would NaN the success math)
    // and we never spend below zero -- the command's spendPool path is what
    // enforces non-negative; here we just verify the floor.
    const char = mkChar({ gnosis: 0, gnosisCurrent: 0, inUmbra: false });
    const r = stepSideways(char, DEFAULT_GAUNTLET, fixed([1]));
    assertEquals(r.roll.pool, 1, "pool must floor at 1, never 0/NaN");
  });

  // E-6: inUmbra flip must be tied to a successful shift outcome only.
  it("E-6: inUmbra toggle is keyed to outcome, not roll partial state", () => {
    // Regression guard: command writes char.inUmbra only on 'entered'/'exited'.
    assert(
      /if \(result\.outcome === "entered" \|\| result\.outcome === "exited"\)/
        .test(STEPSIDE_SRC),
      "command must only persist inUmbra on entered/exited",
    );
    // Mechanic-level: outcome shape never returns entered/exited with !ok.
    const r1 = stepSideways(mkChar({ inUmbra: false }), DEFAULT_GAUNTLET, fixed([1, 1, 2]));
    assertEquals(r1.outcome, "botched");
    assertFalse(r1.ok);
    const r2 = stepSideways(mkChar({ inUmbra: false }), DEFAULT_GAUNTLET, fixed([2, 3, 4]));
    assertEquals(r2.outcome, "failed");
    assertFalse(r2.ok);
  });

  // E-7: hook emission must fire regardless of outcome.
  it("E-7: command emits stepped-sideways hook on every outcome (regression guard)", () => {
    // The emit must be after the outcome branch, not nested inside the
    // success branch. Source check: emitSteppedSideways must appear once,
    // outside the if/else for entered/exited.
    const emits = STEPSIDE_SRC.match(/emitSteppedSideways\(/g) ?? [];
    assertEquals(emits.length, 1, "exactly one emit site");
    // And that emit must reference result.outcome, meaning all four outcomes flow through.
    assert(
      /outcome:\s*result\.outcome/.test(STEPSIDE_SRC),
      "hook payload must include result.outcome (covers all four outcomes)",
    );
  });

  // Bonus: isInUmbra predicate must coerce undefined -> false (no truthy leaks).
  it("isInUmbra coerces missing flag to false", () => {
    assertEquals(isInUmbra(mkChar({})), false);
    assertEquals(isInUmbra(mkChar({ inUmbra: undefined })), false);
    assertEquals(isInUmbra(mkChar({ inUmbra: true })), true);
  });
});
