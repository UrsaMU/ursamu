// Pure-ops tests for the Social Maneuvering subsystem.

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  applyHardLeverage,
  applySoftLeverage,
  attemptDoor,
  baseDoors,
  buildManeuver,
  bumpImpressionDown,
  bumpImpressionUp,
  forceDoors,
} from "../src/social/maneuver.ts";

function mk(extra: Partial<Parameters<typeof buildManeuver>[0]> = {}) {
  return buildManeuver({
    initiatorId: "1",
    initiatorName: "Stacy",
    subjectId: "2",
    subjectName: "Erickson",
    goal: "Loan me the grimoire",
    subjectResolve: 3,
    subjectComposure: 4,
    ...extra,
  });
}

describe("baseDoors", () => {
  it("returns min(Resolve, Composure)", () => {
    assertEquals(baseDoors(3, 4), 3);
    assertEquals(baseDoors(5, 2), 2);
  });
  it("floors at 1 even if attribute is 0", () => {
    assertEquals(baseDoors(0, 3), 1);
  });
});

describe("buildManeuver", () => {
  it("starts at average impression with no penalty/leverage", () => {
    const m = mk();
    assertEquals(m.doorsTotal, 3);
    assertEquals(m.doorsOpen, 0);
    assertEquals(m.impression, "average");
    assertEquals(m.penalty, 0);
    assertEquals(m.leverage.length, 0);
    assertEquals(m.resolved, false);
    assertEquals(m.immune, false);
  });
  it("respects extraDoors", () => {
    const m = mk({ extraDoors: 2 });
    assertEquals(m.doorsTotal, 5);
  });
});

describe("impression bumps", () => {
  it("bump up clamps at perfect", () => {
    let m = mk();
    for (let i = 0; i < 10; i++) m = bumpImpressionUp(m);
    assertEquals(m.impression, "perfect");
  });
  it("bump down clamps at hostile", () => {
    let m = mk();
    for (let i = 0; i < 10; i++) m = bumpImpressionDown(m);
    assertEquals(m.impression, "hostile");
  });
});

describe("soft leverage", () => {
  it("aspiration removes one door", () => {
    const m = mk();
    const r = applySoftLeverage(m, "aspiration", "Help him become respected");
    assertEquals(r.effect, "door-removed");
    assertEquals(r.maneuver.doorsOpen, 1);
    assertEquals(r.maneuver.leverage[0].doorsRemoved, 1);
  });
  it("aspiration cannot remove the last door (bumps impression instead)", () => {
    let m = mk({ subjectResolve: 1, subjectComposure: 1 }); // 1 door
    const r = applySoftLeverage(m, "aspiration", "x");
    assertEquals(r.effect, "impression-up");
    assertEquals(r.maneuver.doorsOpen, 0); // still must roll the last door
    assertEquals(r.maneuver.impression, "good");
    m = r.maneuver;
  });
  it("vice bumps impression up one tier", () => {
    const r = applySoftLeverage(mk(), "vice", "tempt their Vanity");
    assertEquals(r.effect, "impression-up");
    assertEquals(r.maneuver.impression, "good");
  });
});

describe("hard leverage", () => {
  it("removes one door normally and worsens impression", () => {
    const r = applyHardLeverage(mk(), "Gunpoint", false);
    assertEquals(r.doorsRemoved, 1);
    assertEquals(r.maneuver.doorsOpen, 1);
    assertEquals(r.maneuver.impression, "hostile");
  });
  it("severe removes two doors", () => {
    // Use larger door pool so the cap doesn't bite.
    const m = mk({ subjectResolve: 4, subjectComposure: 5 }); // 4 doors
    const r = applyHardLeverage(m, "shot him in the leg", true);
    assertEquals(r.doorsRemoved, 2);
    assertEquals(r.maneuver.doorsOpen, 2);
  });
});

describe("attemptDoor", () => {
  it("blocks while hostile", () => {
    const m = { ...mk(), impression: "hostile" as const };
    const r = attemptDoor(m, { pool: 6, resistance: 4 });
    assertEquals(r.outcome, "blocked");
    assertEquals(r.maneuver.doorsOpen, 0);
  });
  it("on overwhelming pool eventually opens at least one door", () => {
    // Force statistical certainty: pool 30 vs resistance 0.
    const m = mk();
    const r = attemptDoor(m, { pool: 30, resistance: 0 });
    assert(["opened", "resolved"].includes(r.outcome));
    assert(r.doorsOpened >= 1);
  });
  it("on zero pool, failure accumulates a -1 penalty", () => {
    // Pool 0 -> chance die. Defender pool 5 -> almost certainly more
    // successes. Run a handful of times and confirm at least one tick.
    let m = mk();
    let hits = 0;
    for (let i = 0; i < 20; i++) {
      const r = attemptDoor(m, { pool: 0, resistance: 8 });
      m = r.maneuver;
      if (r.outcome === "failed" || r.outcome === "dramatic-fail") hits++;
      if (m.immune) break;
    }
    assert(hits > 0);
  });
});

describe("forceDoors", () => {
  it("on success resolves and marks forced", () => {
    const m = mk();
    const r = forceDoors(m, { pool: 30, resistance: 0 });
    assertEquals(r.outcome, "resolved");
    assertEquals(r.maneuver.forced, true);
    assertEquals(r.maneuver.resolved, true);
    assertEquals(r.maneuver.doorsOpen, m.doorsTotal);
  });
  it("on failure marks subject immune", () => {
    const r = forceDoors(mk(), { pool: 0, resistance: 30 });
    assertEquals(r.outcome, "failed");
    assertEquals(r.maneuver.immune, true);
    assertEquals(r.maneuver.forced, true);
  });
});
