// tests/pools_audit.test.ts -- Security/exploit audit for +rage / +gnosis commands.
//
// Pure-logic vectors (E-1..E-3) exercise core/pools.ts directly. Command-level
// vectors (E-4..E-7) cannot be invoked without the full SDK, so they are
// asserted as static-structure invariants against commands/pool.ts source --
// the prompt explicitly authorizes this approach.
import { assert, assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import { POOL_CAP, regainPool, spendPool } from "../core/pools.ts";
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
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: 0,
    updatedAt: 0,
    rage: 5,
    rageCurrent: 5,
    gnosis: 4,
    gnosisCurrent: 4,
    ...overrides,
  };
}

const POOL_SRC = await Deno.readTextFile(
  new URL("../commands/pool.ts", import.meta.url),
);

describe("+rage / +gnosis audit (exploit vectors)", () => {
  it("E-1: spendPool rejects every non-positive-integer numeric input", () => {
    const bad: unknown[] = [0, 0.5, 1.5, -1, -0.1, NaN, Infinity, -Infinity];
    for (const v of bad) {
      const r = spendPool(mkChar(), "rage", v as number);
      assertEquals(r.ok, false, `should reject ${String(v)}`);
    }
  });

  it("E-1b: spendPool rejects non-number coercions (string, null, undefined)", () => {
    // TS would normally block these; the audit asserts runtime rejection too.
    const bad: unknown[] = ["3", null, undefined, "1e2", "0x5"];
    for (const v of bad) {
      const r = spendPool(mkChar(), "rage", v as number);
      assertEquals(r.ok, false, `should reject ${String(v)}`);
    }
  });

  it("E-2: spendPool rejects negative amounts (no free regain via negative spend)", () => {
    const c = mkChar({ rage: 5, rageCurrent: 2 });
    const before = c.rageCurrent;
    const r = spendPool(c, "rage", -3);
    assertEquals(r.ok, false);
    // Pure function must not mutate.
    assertEquals(c.rageCurrent, before);
  });

  it("E-3: regainPool caps at permanent maximum", () => {
    const c = mkChar({ rage: 5, rageCurrent: 4 });
    const r = regainPool(c, "rage", 999);
    assertEquals(r.ok, true);
    assertEquals(r.current, 5, "regain must cap at permanent");
  });

  it("E-3b: regainPool with massive amount cannot overflow past POOL_CAP", () => {
    const c = mkChar({ rage: POOL_CAP, rageCurrent: 0 });
    const r = regainPool(c, "rage", Number.MAX_SAFE_INTEGER);
    assertEquals(r.ok, true);
    assertEquals(r.current, POOL_CAP);
  });

  it("E-4: /set staff branch checks BOTH isStaff AND canEdit", () => {
    // Static-structure assertion: in the /set branch, the isStaff gate runs
    // first, then a separate canEdit gate runs before any write.
    const setIdx = POOL_SRC.indexOf('sw === "set"');
    assert(setIdx > 0, "could not locate /set branch");
    const tail = POOL_SRC.slice(setIdx);
    const staffIdx = tail.indexOf("isStaff(u)");
    const canEditIdx = tail.indexOf("canEdit(u.me, target)");
    assert(staffIdx > 0, "isStaff gate missing in /set");
    assert(canEditIdx > 0, "canEdit gate missing in /set");
    assert(staffIdx < canEditIdx, "isStaff must precede canEdit");
    // And both must precede the saveChar write.
    const saveIdx = tail.indexOf("saveChar(char)");
    assert(saveIdx > canEditIdx, "saveChar must follow canEdit");
  });

  it("E-5: /set audit-logs the change to char.statLog with staffId+old+new", () => {
    // Static-structure: statLog push includes staffId, trait, old, new, ts.
    const setBlock = POOL_SRC.slice(POOL_SRC.indexOf('sw === "set"'));
    assert(setBlock.includes("statLog"), "no statLog push in /set");
    assert(setBlock.includes("staffId: u.me.id"));
    assert(setBlock.includes("old: oldValue"));
    assert(setBlock.includes("new: n"));
    assert(setBlock.includes("ts: Date.now()"));
    // And must happen before saveChar so audit can't be skipped on failure.
    const logIdx = setBlock.indexOf("statLog");
    const saveIdx = setBlock.indexOf("saveChar(char)");
    assert(logIdx < saveIdx, "audit log must precede saveChar");
  });

  it("E-6: /set on self by non-staff is rejected (isStaff gate, not canEdit)", () => {
    // canEdit typically allows self-edit; the explicit isStaff check is what
    // prevents a non-staff player from /set'ing their own rage from 3 to 10.
    const setBlock = POOL_SRC.slice(POOL_SRC.indexOf('sw === "set"'));
    // The very first thing inside /set must be the isStaff bail.
    const firstReturn = setBlock.indexOf("Permission denied");
    const canEditCheck = setBlock.indexOf("canEdit");
    assert(firstReturn > 0 && firstReturn < canEditCheck,
      "isStaff Permission denied must fire before canEdit (otherwise non-staff self-edit slips through)");
  });

  it("E-7: every successful spend/regain branch emits its hook", () => {
    // Static-structure: spend branch -> emitPoolSpent; regain branch ->
    // emitPoolRegained. Both must come AFTER saveChar so a persistence
    // failure cannot produce phantom hook events.
    const spendBlock = POOL_SRC.slice(
      POOL_SRC.indexOf('sw === "spend"'),
      POOL_SRC.indexOf('sw === "regain"'),
    );
    assert(spendBlock.includes("emitPoolSpent("), "spend branch missing emit");
    const sSave = spendBlock.indexOf("saveChar(char)");
    const sEmit = spendBlock.indexOf("emitPoolSpent(");
    assert(sSave > 0 && sEmit > sSave, "emitPoolSpent must follow saveChar");

    const regainBlock = POOL_SRC.slice(POOL_SRC.indexOf('sw === "regain"'));
    assert(regainBlock.includes("emitPoolRegained("), "regain branch missing emit");
    const rSave = regainBlock.indexOf("saveChar(char)");
    const rEmit = regainBlock.indexOf("emitPoolRegained(");
    assert(rSave > 0 && rEmit > rSave, "emitPoolRegained must follow saveChar");
  });

  it("E-7b: /set staff write emits emitStatChanged for downstream audit", () => {
    const setBlock = POOL_SRC.slice(POOL_SRC.indexOf('sw === "set"'));
    assert(setBlock.includes("emitStatChanged("), "/set missing emitStatChanged");
  });

  it("E-8: pure spend/regain are non-mutating (no state-tear races)", () => {
    // Defense against race conditions: pool helpers must never mutate the
    // input char. The caller serializes writes via saveChar.
    const c = mkChar({ rage: 5, rageCurrent: 5 });
    const snap = JSON.stringify(c);
    spendPool(c, "rage", 3);
    regainPool(c, "rage", 2);
    assertEquals(JSON.stringify(c), snap, "pool helpers must not mutate char");
  });
});
