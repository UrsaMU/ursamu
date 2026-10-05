// Vampire play systems: Vitae, Frenzy, Aura, Feeding (phases 2–3).

import {
  assertEquals,
  assertStringIncludes,
  assert,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { defaultSheet, setTrait } from "../cofd.ts";
import {
  vitaeMaxForBp,
  vitaePerTurn,
  humanityModifier,
  spendVitae,
  gainVitae,
  healWithVitae,
  blushOfLife,
  boostPhysical,
  isVampireSheet,
} from "../src/vitae/index.ts";
import {
  rollFrenzyResist,
  enterFrenzy,
  endFrenzy,
  isFrenzied,
  rollAuraContest,
  findAuraFlavor,
  applyAuraCondition,
  applyFeed,
  slakeCap,
} from "../src/beast/index.ts";
import { rollBreakingPoint } from "../src/integrity/engine.ts";
import { COFD_TEMPLATES } from "../src/gamelines/templates.ts";
import type { RollResult } from "../src/roller/execute.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function vampSheet() {
  let s = defaultSheet();
  s = setTrait(s, "template", "vampire");
  s = setTrait(s, "clan", "Daeva");
  s.energyCurrent = 10;
  s.moralityValue = 7;
  s.powerStatValue = 1;
  s.attributes.strength = 2;
  s.attributes.presence = 3;
  s.attributes.composure = 2;
  s.attributes.resolve = 2;
  s.skills.intimidation = 2;
  s.health = { bashing: 2, lethal: 1, aggravated: 0 };
  return s;
}

function fakeRoll(
  successes: number,
  opts: { dramatic?: boolean; exceptional?: boolean } = {},
): RollResult {
  return {
    pool: 5,
    rolls: [8, 8, 8, 8, 8],
    successes,
    exceptional: !!opts.exceptional || successes >= 5,
    dramaticFailure: !!opts.dramatic,
    isChanceDie: false,
    again: 10,
    rote: false,
  };
}

describe("VtR Vitae / BP table", OPTS, () => {
  it("BP table matches VtR maxima", () => {
    assertEquals(vitaeMaxForBp(1), 10);
    assertEquals(vitaeMaxForBp(2), 11);
    assertEquals(vitaeMaxForBp(10), 75);
    assertEquals(vitaePerTurn(1), 1);
    assertEquals(vitaePerTurn(5), 5);
  });

  it("vampire template uses VtR vitae max", () => {
    assertEquals(
      COFD_TEMPLATES.vampire.energyMaxFormula(10),
      75,
    );
  });

  it("spend and gain Vitae", () => {
    const s = vampSheet();
    assert(isVampireSheet(s));
    const spent = spendVitae(s, 2, { ignorePerTurn: true });
    assert(spent.ok, spent.reason);
    assertEquals(spent.sheet!.energyCurrent, 8);

    const over = spendVitae(s, 2); // per-turn cap 1 at BP1
    assertEquals(over.ok, false);

    const gain = gainVitae(spent.sheet!, 5);
    assert(gain.ok);
    assertEquals(gain.sheet!.energyCurrent, 10);
  });

  it("heal and blush and boost", () => {
    let s = vampSheet();
    const heal = healWithVitae(s, "bashing");
    assert(heal.ok, heal.reason);
    assertEquals(heal.sheet!.health!.bashing, 1);
    assertEquals(heal.sheet!.energyCurrent, 9);

    s = heal.sheet!;
    const blush = blushOfLife(s);
    assert(blush.ok);
    assertEquals(blush.sheet!.customFields.blush, "active");

    s = blush.sheet!;
    const boost = boostPhysical(s, "strength");
    assert(boost.ok, boost.reason);
    assertEquals(boost.sheet!.tempStats!.strength, 4);
  });
});

describe("VtR Humanity breaking points", OPTS, () => {
  it("Humanity 7 uses 0 mod (not Integrity +1)", () => {
    assertEquals(humanityModifier(7), 0);
    assertEquals(humanityModifier(6), 0);
    assertEquals(humanityModifier(9), 2);
    assertEquals(humanityModifier(3), -2);

    const sheet = vampSheet();
    const r = rollBreakingPoint({
      integrity: 7,
      resolve: 2,
      composure: 2,
      template: "vampire",
    }, sheet, fakeRoll(1));
    assertEquals(r.integrityMod, 0);
    assertEquals(r.pool, 4); // 2+2+0
  });
});

describe("VtR Frenzy", OPTS, () => {
  it("resist success does not frenzy", () => {
    const r = rollFrenzyResist({
      kind: "anger",
      resolve: 3,
      composure: 3,
      humanity: 7,
    }, fakeRoll(2));
    assertEquals(r.outcome, "success");
  });

  it("enter and end frenzy", () => {
    let s = vampSheet();
    const ent = enterFrenzy(s, "hunger");
    assert(ent.ok);
    assert(isFrenzied(ent.sheet!));
    const end = endFrenzy(ent.sheet!);
    assert(end.ok);
    assertEquals(isFrenzied(end.sheet!), false);
  });

  it("ride costs Willpower", () => {
    let s = vampSheet();
    s.advantages.willpowerCurrent = 0;
    const fail = enterFrenzy(s, "terror", { ride: true });
    assertEquals(fail.ok, false);

    s.advantages.willpowerCurrent = 2;
    const ride = enterFrenzy(s, "terror", { ride: true });
    assert(ride.ok);
    assertEquals(ride.sheet!.advantages.willpowerCurrent, 1);
    assertStringIncludes(
      ride.sheet!.customFields.frenzy ?? "",
      "riding",
    );
  });
});

describe("VtR Predatory Aura", OPTS, () => {
  it("resolves flavors and contests", () => {
    const f = findAuraFlavor("hungry");
    assert(f);
    assertEquals(f!.condition, "bestial");

    const win = rollAuraContest(
      { presence: 3, intimidation: 2, bloodPotency: 1 },
      { composure: 1, tolerance: 0 },
      f!,
      { project: fakeRoll(3), resist: fakeRoll(0) },
    );
    assert(win.projectorWins);

    const sheet = defaultSheet();
    const next = applyAuraCondition(sheet, f!);
    assert(
      (next.conditions ?? []).some((c) => c.key === "bestial"),
    );
  });
});

describe("VtR Feeding", OPTS, () => {
  it("animal blood fails at BP 2+", () => {
    assertEquals(slakeCap(1, "animal", 2), 1);
    assertEquals(slakeCap(2, "animal", 2), 0);
  });

  it("feeds and damages vessel", () => {
    const pred = vampSheet();
    pred.energyCurrent = 5;
    let victim = defaultSheet();
    victim.health = { bashing: 0, lethal: 0, aggravated: 0 };
    victim.attributes.stamina = 2;
    victim.advantages.size = 5;

    const r = applyFeed(pred, 2, "human", victim);
    assert(r.ok, r.reason);
    assertEquals(r.gained, 2);
    assertEquals(r.predator!.energyCurrent, 7);
    assertEquals(r.victim!.health!.lethal, 2);
  });
});
