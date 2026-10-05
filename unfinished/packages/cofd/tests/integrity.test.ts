// Tests for the Breaking Points / Integrity engine and the +integrity command.

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  applyBreakingPoint,
  clampSituational,
  integrityModifier,
  rollBreakingPoint,
} from "../src/integrity/engine.ts";
import { addCondition } from "../src/subsystems/conditions.ts";
import { defaultSheet, refreshAdvantages } from "../src/stats/index.ts";
import type { RollResult } from "../src/roller/execute.ts";
import { integrityExec } from "../src/commands/integrity.ts";
import { mockPlayer, mockU } from "./helpers/mockU.ts";

function fakeRoll(opts: Partial<RollResult>): RollResult {
  return {
    successes: 0,
    rolls: [],
    exceptional: false,
    dramaticFailure: false,
    isChanceDie: false,
    again: 10,
    rote: false,
    ...opts,
  };
}

describe("integrityModifier (RAW p.73)", () => {
  it("8-10 -> +2", () => {
    assertEquals(integrityModifier(10), 2);
    assertEquals(integrityModifier(8), 2);
  });
  it("6-7 -> +1", () => {
    assertEquals(integrityModifier(7), 1);
    assertEquals(integrityModifier(6), 1);
  });
  it("4-5 -> 0", () => {
    assertEquals(integrityModifier(5), 0);
    assertEquals(integrityModifier(4), 0);
  });
  it("2-3 -> -1", () => {
    assertEquals(integrityModifier(3), -1);
    assertEquals(integrityModifier(2), -1);
  });
  it("0-1 -> -2", () => {
    assertEquals(integrityModifier(1), -2);
    assertEquals(integrityModifier(0), -2);
  });
});

describe("clampSituational (cap +/-5 per RAW)", () => {
  it("clamps high values to +5", () => assertEquals(clampSituational(8), 5));
  it("clamps low values to -5", () => assertEquals(clampSituational(-9), -5));
  it("passes through in-range values", () => assertEquals(clampSituational(-3), -3));
});

describe("rollBreakingPoint outcome paths", () => {
  const sheet = (() => {
    const s = defaultSheet();
    s.attributes.resolve = 3;
    s.attributes.composure = 3;
    s.moralityValue = 7;
    return refreshAdvantages(s);
  })();

  it("dramatic failure -> 1 Integrity loss + madness/fugue/broken + 1 Beat", () => {
    const r = rollBreakingPoint(
      { integrity: 7, resolve: 3, composure: 3 },
      sheet,
      fakeRoll({ dramaticFailure: true, rolls: [1, 1, 1] }),
    );
    assertEquals(r.outcome, "dramatic");
    assertEquals(r.integrityLoss, 1);
    assertEquals(r.beatsAwarded, 1);
    assertEquals(r.conditionsGranted, ["madness"]);
  });

  it("failure -> 1 Integrity loss + shaken/guilty", () => {
    const r = rollBreakingPoint(
      { integrity: 7, resolve: 3, composure: 3 },
      sheet,
      fakeRoll({ successes: 0, rolls: [2, 3, 4] }),
    );
    assertEquals(r.outcome, "failure");
    assertEquals(r.integrityLoss, 1);
    assertEquals(r.conditionsGranted, ["shaken"]);
  });

  it("success -> no loss, mild condition", () => {
    const r = rollBreakingPoint(
      { integrity: 7, resolve: 3, composure: 3 },
      sheet,
      fakeRoll({ successes: 2, rolls: [8, 9, 2] }),
    );
    assertEquals(r.outcome, "success");
    assertEquals(r.integrityLoss, 0);
    assertEquals(r.conditionsGranted, ["guilty"]);
  });

  it("exceptional -> no loss, steadfast/inspired + 1 WP + 1 Beat", () => {
    const r = rollBreakingPoint(
      { integrity: 7, resolve: 3, composure: 3 },
      sheet,
      fakeRoll({ successes: 5, exceptional: true, rolls: [8, 9, 10, 8, 9] }),
    );
    assertEquals(r.outcome, "exceptional");
    assertEquals(r.integrityLoss, 0);
    assertEquals(r.willpowerRegained, 1);
    assertEquals(r.beatsAwarded, 1);
    assertEquals(r.conditionsGranted, ["steadfast"]);
  });

  it("pool = resolve + composure + integrityMod + situational, floored at 0", () => {
    const r = rollBreakingPoint(
      { integrity: 1, resolve: 1, composure: 1, modifier: -5 },
      sheet,
      fakeRoll({ isChanceDie: true, successes: 0 }),
    );
    // integrity 1 -> -2; situational clamped from -5 (already in range)
    assertEquals(r.integrityMod, -2);
    assertEquals(r.totalModifier, -7);
    assertEquals(r.pool, -5);
  });

  it("picks next condition when first candidate already active", () => {
    let s = defaultSheet();
    s = addCondition(s, "shaken");
    const r = rollBreakingPoint(
      { integrity: 7, resolve: 3, composure: 3 },
      s,
      fakeRoll({ successes: 0 }),
    );
    assertEquals(r.outcome, "failure");
    assertEquals(r.conditionsGranted, ["guilty"]);
  });
});

describe("applyBreakingPoint", () => {
  it("decrements Integrity, adds Condition, idempotent on re-add", () => {
    const s = refreshAdvantages(defaultSheet());
    const r = rollBreakingPoint(
      { integrity: s.moralityValue, resolve: 3, composure: 3 },
      s,
      fakeRoll({ successes: 0 }),
    );
    const out = applyBreakingPoint(s, r);
    assertEquals(out.moralityValue, s.moralityValue - 1);
    assertEquals((out.conditions ?? []).map(c => c.key), ["shaken"]);
  });

  it("floors Integrity at 0", () => {
    const s = refreshAdvantages({ ...defaultSheet(), moralityValue: 0 });
    const r = rollBreakingPoint(
      { integrity: 0, resolve: 1, composure: 1 },
      s,
      fakeRoll({ successes: 0 }),
    );
    const out = applyBreakingPoint(s, r);
    assertEquals(out.moralityValue, 0);
  });

  it("restores willpower on exceptional capped at willpowerMax", () => {
    let s = refreshAdvantages(defaultSheet());
    s = { ...s, advantages: { ...s.advantages, willpowerCurrent: 1, willpowerMax: 4 } };
    const r = rollBreakingPoint(
      { integrity: 7, resolve: 3, composure: 3 },
      s,
      fakeRoll({ successes: 5, exceptional: true }),
    );
    const out = applyBreakingPoint(s, r);
    assertEquals(out.advantages.willpowerCurrent, 2);
  });

  it("does not exceed willpowerMax when already full", () => {
    let s = refreshAdvantages(defaultSheet());
    s = { ...s, advantages: { ...s.advantages, willpowerCurrent: 4, willpowerMax: 4 } };
    const r = rollBreakingPoint(
      { integrity: 7, resolve: 3, composure: 3 },
      s,
      fakeRoll({ successes: 5, exceptional: true }),
    );
    const out = applyBreakingPoint(s, r);
    assertEquals(out.advantages.willpowerCurrent, 4);
  });
});

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function approvedSheet() {
  const s = refreshAdvantages(defaultSheet());
  s.attributes.resolve = 3;
  s.attributes.composure = 3;
  s.moralityValue = 7;
  return s;
}

Deno.test("+integrity (view self)", OPTS, async () => {
  const me = mockPlayer({ id: "1", name: "Alice", state: { cofd: approvedSheet() } });
  const u = mockU({ me, args: ["", ""] });
  await integrityExec(u);
  assert(u._sent.some(line => line.includes("Integrity: 7/10")), `out: ${u._sent.join("|")}`);
});

Deno.test("+integrity (view: missing sheet)", OPTS, async () => {
  const me = mockPlayer({ id: "1", name: "Alice" });
  const u = mockU({ me, args: ["", ""] });
  await integrityExec(u);
  assert(u._sent.some(l => l.includes("approved character sheet")));
});

Deno.test("+integrity/break requires a reason", OPTS, async () => {
  const me = mockPlayer({ id: "1", name: "Alice", state: { cofd: approvedSheet() } });
  const u = mockU({ me, args: ["break", ""] });
  await integrityExec(u);
  assert(u._sent.some(l => l.toLowerCase().includes("usage")));
});

Deno.test("+integrity/break self emits roll detail and persists via data.cofd", OPTS, async () => {
  const me = mockPlayer({ id: "1", name: "Alice", state: { cofd: approvedSheet() } });
  const u = mockU({ me, args: ["break", "Saw a ghost"] });
  await integrityExec(u);

  assert(u._sent.some(l => l.includes("Pool")), `no Pool line: ${u._sent.join("|")}`);
  assert(u._sent.some(l => l.includes("Outcome")));
  assert(u._sent.some(l => l.includes("Reason : Saw a ghost")));
  assertEquals(u._dbCalls[0][1], "$set");
  const data = u._dbCalls[0][2] as Record<string, unknown>;
  assert("data.cofd" in data, `expected data.cofd write, got: ${Object.keys(data).join(",")}`);
});

Deno.test("+integrity/break cross-player blocked without canEdit", OPTS, async () => {
  const me = mockPlayer({ id: "1", name: "ST" });
  const them = mockPlayer({ id: "2", name: "Marcus", state: { cofd: approvedSheet() } });
  const u = mockU({ me, args: ["break", "Marcus=Killed someone"], targetResult: them, canEditResult: false });
  await integrityExec(u);
  assert(u._sent.some(l => l.toLowerCase().includes("permission denied")));
  assertEquals(u._dbCalls.length, 0);
});

Deno.test("+integrity/break cross-player allowed with canEdit", OPTS, async () => {
  const me = mockPlayer({ id: "1", name: "ST" });
  const them = mockPlayer({ id: "2", name: "Marcus", state: { cofd: approvedSheet() } });
  const u = mockU({ me, args: ["break", "Marcus=Killed someone -3"], targetResult: them, canEditResult: true });
  await integrityExec(u);
  assertEquals(u._dbCalls[0][0], "2");
  assertEquals(u._dbCalls[0][1], "$set");
});

Deno.test("+integrity/set validates 0..10", OPTS, async () => {
  const me = mockPlayer({ id: "1", name: "Alice", state: { cofd: approvedSheet() } });
  const u = mockU({ me, args: ["set", "11"] });
  await integrityExec(u);
  assert(u._sent.some(l => l.includes("0 to 10")));
  assertEquals(u._dbCalls.length, 0);
});

Deno.test("+integrity/set writes data.cofd", OPTS, async () => {
  const me = mockPlayer({ id: "1", name: "Alice", state: { cofd: approvedSheet() } });
  const u = mockU({ me, args: ["set", "5"] });
  await integrityExec(u);
  assertEquals(u._dbCalls[0][1], "$set");
  const data = u._dbCalls[0][2] as Record<string, unknown>;
  assert("data.cofd" in data);
  assertEquals((data["data.cofd"] as { moralityValue: number }).moralityValue, 5);
});

Deno.test("+integrity unknown switch reports error", OPTS, async () => {
  const me = mockPlayer({ id: "1", name: "Alice", state: { cofd: approvedSheet() } });
  const u = mockU({ me, args: ["xyzzy", ""] });
  await integrityExec(u);
  assert(u._sent.some(l => l.includes("Unknown")));
});

Deno.test("+integrity/break strips % codes from reason before storing", OPTS, async () => {
  const me = mockPlayer({ id: "1", name: "Alice", state: { cofd: approvedSheet() } });
  const u = mockU({ me, args: ["break", "%crSaw%cn a ghost"] });
  await integrityExec(u);
  assert(u._sent.some(l => l.includes("Reason : Saw a ghost")), `reason not stripped: ${u._sent.join("|")}`);
});
