// tests/conceal_audit.test.ts -- /tdd-audit security pass for +conceal /
// +reveal / +spot.
//
// Most exploit vectors map onto in-command guards (carry/worn-wielded/
// concealability checks) and are encoded here as source-text regression
// guards plus mechanic-level assertions against pure helpers. The
// command files own the gating; if a future refactor drops a guard the
// regex assertion fires.
import { assert, assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import { concealDifficulty } from "../core/spot.ts";
import { getEqMeta } from "../core/eq.ts";

const CONCEAL_SRC = await Deno.readTextFile(
  new URL("../commands/conceal.ts", import.meta.url),
);
const SPOT_SRC = await Deno.readTextFile(
  new URL("../commands/spot.ts", import.meta.url),
);

describe("/tdd-audit +conceal / +reveal / +spot", () => {
  // C-1: +conceal must scan only u.me.contents -- not the room, not
  // other players. The exploit would be "conceal someone else's pistol".
  it("C-1: +conceal scans only u.me.contents (regression guard)", () => {
    // The lookup helper is the only place that finds the candidate item.
    // It must read u.me.contents and nothing else.
    assert(
      /findHeldByName\(u[^)]*\)/.test(CONCEAL_SRC),
      "conceal must funnel item lookup through findHeldByName(u, ...)",
    );
    assert(
      /\(u\.me as any\)\??\.contents/.test(CONCEAL_SRC),
      "findHeldByName must read u.me.contents (not u.here / target)",
    );
    // And nowhere does the conceal exec call u.util.target -- that would
    // open the door to remote-item targeting.
    assert(
      !/u\.util\.target/.test(CONCEAL_SRC),
      "+conceal must never resolve items via u.util.target",
    );
  });

  // C-2: concealability="N" rejected with a clear message.
  it("C-2: +conceal rejects concealability=N items", () => {
    assert(
      /meta\.concealability\s*===\s*"N"/.test(CONCEAL_SRC),
      "must gate concealability === 'N'",
    );
    assert(
      /too obvious to conceal/i.test(CONCEAL_SRC),
      "must surface a clear refusal message",
    );
    // Mechanic-level: N maps to 'auto', so even if the gate were bypassed
    // the spot path resolves it as an immediate find.
    assertEquals(concealDifficulty({ state: { concealability: "N" } }), "auto");
  });

  // C-3: must require worn||wielded -- can't conceal pocket lint.
  it("C-3: +conceal requires worn||wielded (regression guard)", () => {
    assert(
      /!meta\.worn\s*&&\s*!meta\.wielded/.test(CONCEAL_SRC),
      "conceal must gate !worn && !wielded",
    );
    assert(
      /already out of sight/i.test(CONCEAL_SRC),
      "must explain why loose gear is already concealed",
    );
  });

  // C-4: +reveal must not crash when item is not concealed.
  it("C-4: +reveal is silent (no broadcast) when item not concealed", () => {
    // The "not concealed" branch must `return` before any $unset or
    // poseRoom call. Order: check concealed -> early return.
    const m = CONCEAL_SRC.match(
      /if \(!meta\.concealed\)\s*\{\s*u\.send\([^)]+\);\s*return;\s*\}/,
    );
    assert(m, "+reveal must early-return when !meta.concealed");
    // And confirm poseRoom is not called before the guard.
    const revealIdx = CONCEAL_SRC.indexOf("// reveal");
    const guardIdx  = CONCEAL_SRC.indexOf("not concealed", revealIdx);
    const poseIdx   = CONCEAL_SRC.indexOf("poseRoom", revealIdx);
    assert(guardIdx > 0 && poseIdx > guardIdx,
      "guard must precede poseRoom in the reveal branch");
  });

  // C-5: spot pool floors at 1 even with no character / zero stats.
  it("C-5: +spot pool floors at 1 (regression guard)", () => {
    // Source-level: there's a final clamp `if (pool < 1) pool = 1`.
    assert(
      /if \(pool < 1\) pool = 1/.test(SPOT_SRC),
      "spot must floor pool at 1",
    );
    // And the no-char branch defaults pool=1 before reading stats.
    assert(
      /let pool = 1;/.test(SPOT_SRC),
      "spot must initialise pool=1 before any optional stat read",
    );
  });

  // C-6: spot must read state.concealed via live-state path, not from
  // state.attributes (which builder-set definitions write to). A
  // regression that flipped the flag onto the attributes array would
  // make every concealed item appear to staff-builder writes.
  it("C-6: concealed flag reads via readLiveBool (live-state)", () => {
    // Pure: build an item with `state.attributes.concealed = true` only
    // and confirm getEqMeta does NOT treat it as concealed.
    const fakeBuilder = {
      state: { attributes: [{ name: "CONCEALED", value: true }] },
    };
    assertEquals(
      getEqMeta(fakeBuilder).concealed, undefined,
      "concealed must NOT be inferred from state.attributes",
    );
    // Whereas direct state.concealed wins.
    const live = { state: { concealed: true } };
    assertEquals(getEqMeta(live).concealed, true);
  });

  // C-7: concealability='N' resolves to auto-spot (no roll needed).
  it("C-7: +spot treats N concealability as auto-spot", () => {
    // Source guard: there must be a diff === 'auto' branch that emits
    // a Found line without rolling.
    assert(
      /if \(diff === "auto"\)/.test(SPOT_SRC),
      "spot must short-circuit on auto",
    );
    // The auto branch must `continue` -- not fall through to rollDice.
    const autoBlock = SPOT_SRC.match(
      /if \(diff === "auto"\)\s*\{[\s\S]*?continue;\s*\}/,
    );
    assert(autoBlock, "auto branch must `continue` past rollDice");
    // Mechanic-level corroboration.
    assertEquals(concealDifficulty({ state: { concealability: "N" } }), "auto");
  });

  // C-8: wound penalty applied to spot pool.
  it("C-8: +spot applies wound penalty to perception pool", () => {
    assert(
      /woundPenalty\(char\)/.test(SPOT_SRC),
      "spot must consult woundPenalty()",
    );
    assert(
      /pool = Math\.max\(0, pool - penalty\)/.test(SPOT_SRC),
      "spot must deduct penalty before flooring at 1",
    );
  });
});
