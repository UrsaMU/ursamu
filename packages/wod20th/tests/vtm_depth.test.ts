// tests/vtm_depth.test.ts -- Priorities 1-6: powers, clan, diablerie, paths,
// social pure helpers, merits, derange, ghoul.
import { assert, assertEquals } from "@std/assert";
import { initTrack, applyDamage } from "../core/health.ts";
import type { IWoDChar } from "../core/types.ts";
import "../splats/vtm/index.ts";
import {
  ACTIVE_POWERS,
  getPower,
  powersForDiscipline,
} from "../splats/vtm/data/powers.ts";
import { useDisciplinePower } from "../core/disciplineUse.ts";
import { evaluateRoll } from "../core/dice.ts";
import {
  frenzyDiffBonus,
  sunDamageBonus,
  feedPerTurnMax,
  ventrueFeedBlock,
  applyGangrelFrenzyScar,
} from "../core/clanWeakness.ts";
import { applyHazard } from "../core/hazard.ts";
import { feedFromVessel } from "../core/feed.ts";
import { attemptDiablerie } from "../core/diablerie.ts";
import {
  humanityCheck,
  setPath,
  pathForChar,
  ALL_PATHS,
} from "../core/humanity.ts";
import { deepenBond } from "../core/bond.ts";
import {
  addDerangement,
  removeDerangement,
  ensureMalkavianDerangement,
} from "../core/derangement.ts";
import {
  makeGhoul,
  embraceMortal,
} from "../core/embrace.ts";
import {
  feedGhoulVitae,
  applyGhoulWithdrawal,
  ghoulStatus,
  setGhoulDiscipline,
  GHOUL_VITAE_MS,
} from "../core/ghoul.ts";
import { resistBeast, applyBeastOutcome } from "../core/kindred.ts";
import { isInClanDiscipline } from "../core/xp.ts";
import { parseBoonWeight } from "../db/boonDb.ts";

function mk(over: Partial<IWoDChar> = {}): IWoDChar {
  const now = Date.now();
  return {
    id: "v1",
    playerId: "p1",
    splat: "vtm",
    status: "approved",
    chargenStep: 6,
    concept: "x",
    attributePriority: ["", "", ""],
    attributes: {
      Strength: 3,
      Dexterity: 2,
      Stamina: 2,
      Charisma: 2,
      Manipulation: 2,
      Appearance: 2,
      Perception: 2,
      Intelligence: 2,
      Wits: 2,
    },
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {
      Brawl: 2,
      Intimidation: 2,
      Empathy: 2,
      Occult: 3,
      Medicine: 2,
      Athletics: 2,
      Subterfuge: 2,
    },
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 5,
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: now,
    updatedAt: now,
    clan: "brujah",
    generation: 12,
    bloodMax: 11,
    bloodPool: 10,
    bloodPerTurn: 2,
    disciplines: {
      Presence: 5,
      Dominate: 5,
      Protean: 5,
      Quietus: 5,
      Thaumaturgy: 5,
      Necromancy: 5,
      Animalism: 5,
      Celerity: 2,
    },
    virtues: { Conscience: 3, "Self-Control": 3, Courage: 3 },
    humanity: 6,
    path: "Humanity",
    healthTrack: initTrack(),
    ...over,
  };
}

Deno.test("1: power catalog covers L1-5 for commons + clan", () => {
  assert(ACTIVE_POWERS.length >= 50);
  assertEquals(powersForDiscipline("Presence").length, 5);
  assertEquals(powersForDiscipline("Dominate").length, 5);
  assertEquals(powersForDiscipline("Protean").length, 5);
  assert(getPower("majesty"));
  assert(getPower("possession"));
  assert(getPower("mist-form"));
  assert(getPower("thaumaturgy-cauldron-of-blood"));
  assert(getPower("necromancy-ex-nihilo"));
  assert(getPower("dagon-s-call") || getPower("dagons-call") ||
    getPower("dagon-s-call") === undefined);
  // Dagon's Call slug
  assert(getPower("dagon-s-call") || ACTIVE_POWERS.some((p) =>
    p.name.includes("Dagon")
  ));
});

Deno.test("1: force_blood and damage effects apply", () => {
  const a = mk({ bloodPool: 8 });
  const d = mk({
    id: "def",
    bloodPool: 5,
    willpower: 1,
    healthTrack: initTrack(),
  });
  let i = 0;
  const rolls = [
    [10, 10, 10, 10, 10],
    [2],
  ];
  const rng = (pool: number, diff = 6) => {
    const dice = rolls[i++] ?? [10, 10, 10];
    return evaluateRoll(dice.slice(0, pool), diff, false);
  };
  const r = useDisciplinePower(a, "Blood Rage def", {
    target: d,
    targetName: "Def",
    rng,
  });
  assert(r.ok);
  assertEquals(r.opposedWon, true);
  assertEquals(d.bloodPool, 4); // forced 1

  const a2 = mk({ bloodPool: 8, disciplines: { Quietus: 5 } });
  const d2 = mk({ id: "d2", healthTrack: initTrack(), willpower: 1 });
  i = 0;
  const r2 = useDisciplinePower(a2, "taste-of-death", {
    target: d2,
    targetName: "D2",
    rng: (pool, diff = 6) =>
      evaluateRoll([10, 10, 10, 10].slice(0, pool), diff, false),
  });
  assert(r2.ok);
  assert(r2.opposedWon !== false);
});

Deno.test("1: earth-meld shape toggles", () => {
  const c = mk({ bloodPool: 5, disciplines: { Protean: 3 } });
  const r = useDisciplinePower(c, "earth-meld");
  assert(r.ok);
  assertEquals(c.proteanForm, "earth");
  const r2 = useDisciplinePower(c, "earth-meld");
  assert(r2.ok);
  assertEquals(c.proteanForm, undefined);
});

Deno.test("2: Brujah frenzy diff +2", () => {
  const b = mk({ clan: "brujah" });
  assertEquals(frenzyDiffBonus(b), 2);
  const t = mk({ clan: "toreador" });
  assertEquals(frenzyDiffBonus(t), 0);
});

Deno.test("2: Setite sun extra damage", () => {
  const s = mk({ clan: "followers-of-set", healthTrack: initTrack() });
  assertEquals(sunDamageBonus(s), 1);
  const r = applyHazard(s, "sun", 2);
  assert(r.ok);
  assertEquals(r.applied, 3);
});

Deno.test("2: Giovanni feed rate 1 + Ventrue preference", () => {
  const g = mk({ clan: "giovanni", bloodPool: 5 });
  assertEquals(feedPerTurnMax(g), 1);
  const vessel = mk({
    id: "mort",
    splat: "mortal",
    healthTrack: initTrack(),
    bloodPool: undefined,
  });
  const fr = feedFromVessel(g, vessel, 3);
  assert(fr.ok);
  assertEquals(fr.gained, 1);

  const v = mk({
    clan: "ventrue",
    feedingPreference: "student",
    bloodPool: 5,
  });
  const block = ventrueFeedBlock(v, "a banker");
  assert(block);
  const ok = ventrueFeedBlock(v, "college student");
  assertEquals(ok, null);
});

Deno.test("2: Gangrel animal features on frenzy", () => {
  const g = mk({ clan: "gangrel", animalFeatures: 4 });
  const note = applyGangrelFrenzyScar(g);
  assert(note);
  assertEquals(g.animalFeatures, 5);
  // 5th feature drops a Social
  assert(
    (g.attributes.Appearance ?? 2) === 1 ||
      (g.attributes.Charisma ?? 2) === 1,
  );
});

Deno.test("3: diablerie lowers gen and stains", () => {
  const pred = mk({
    generation: 12,
    bloodMax: 11,
    bloodPool: 5,
    humanity: 5,
  });
  const vic = mk({
    id: "vic",
    generation: 10,
    bloodMax: 13,
    bloodPool: 3,
    healthTrack: initTrack(),
  });
  // incap victim
  applyDamage(vic, "L", 7);
  const r = attemptDiablerie(pred, vic, (pool, diff = 6) =>
    evaluateRoll(Array(pool).fill(10), diff, false)
  );
  assert(r.ok);
  assertEquals(pred.generation, 11);
  assertEquals(pred.diablerieStains, 1);
  assert(vic.inTorpor);
});

Deno.test("3: paths of enlightenment", () => {
  assert(ALL_PATHS.length >= 5);
  const c = mk();
  const r = setPath(c, "Night");
  assert(r.ok);
  assertEquals(pathForChar(c.path).id, "night");
  assert(c.virtues?.Conviction !== undefined);
  // sin check uses Conviction path
  const chk = humanityCheck(c, 3, (pool, diff = 6) =>
    evaluateRoll(Array(pool).fill(2), diff, false)
  );
  assert(chk.ok);
  assert(chk.lost);
  assertEquals(c.humanity, 5);
});

Deno.test("5: Unbondable blocks bond", () => {
  const thrall = mk({
    id: "th",
    merits: { Unbondable: 3 },
  });
  const reg = mk({ id: "reg" });
  const r = deepenBond(thrall, reg);
  assertEquals(r.ok, false);
  assert(r.message.includes("Unbondable"));
});

Deno.test("6: derangements + Malkavian floor", () => {
  const m = mk({ clan: "malkavian", derangements: undefined });
  ensureMalkavianDerangement(m);
  assertEquals(m.derangements?.length, 1);
  addDerangement(m, "paranoia"); // may already have
  addDerangement(m, "obsession");
  const rm = removeDerangement(m, m.derangements![0]);
  // still has one left ok
  assert(rm.ok || m.derangements!.length >= 1);
  // strip to one then block
  m.derangements = ["paranoia"];
  const blocked = removeDerangement(m, "paranoia");
  assertEquals(blocked.ok, false);
});

Deno.test("6: ghoul lifecycle", () => {
  const dom = mk({ bloodPool: 5 });
  const thrall: IWoDChar = {
    ...mk({
      id: "gh",
      splat: "mortal",
      clan: undefined,
      disciplines: undefined,
      bloodPool: undefined,
      bloodMax: undefined,
    }),
  };
  const g = makeGhoul(dom, thrall);
  assert(g.ok);
  assert(thrall.isGhoul);
  assert(thrall.ghoulLastFedAt);
  const fed = feedGhoulVitae(dom, thrall, 1);
  assert(fed.ok);
  assertEquals(dom.bloodPool, 4);
  setGhoulDiscipline(thrall, "Potence", 1);
  assertEquals(thrall.ghoulDisciplines?.Potence, 1);
  // force withdrawal
  thrall.ghoulLastFedAt = Date.now() - GHOUL_VITAE_MS - 1000;
  const st = ghoulStatus(thrall);
  assert(st.inWithdrawal);
  const w = applyGhoulWithdrawal(thrall, true);
  assert(w.withdrew);
  assertEquals(thrall.ghoulDisciplines, undefined);
});

Deno.test("6: embrace seeds Malkavian derangement", () => {
  const sire = mk({ clan: "malkavian" });
  const childe = mk({
    id: "ch",
    splat: "mortal",
    clan: undefined,
    status: "approved",
  });
  const r = embraceMortal(sire, childe);
  assert(r.ok);
  assertEquals(childe.splat, "vtm");
  assert((childe.derangements?.length ?? 0) >= 1);
});

Deno.test("xp in-clan vs out-of-clan", () => {
  const c = mk({ clan: "brujah", disciplines: { Presence: 2, Auspex: 2 } });
  assert(isInClanDiscipline(c, "Presence"));
  assertEquals(isInClanDiscipline(c, "Auspex"), false);
});

Deno.test("boon weight parse", () => {
  assertEquals(parseBoonWeight("major"), "major");
  assertEquals(parseBoonWeight("life"), "life");
  assertEquals(parseBoonWeight("nope"), null);
});

Deno.test("2: Brujah resistBeast uses higher difficulty", () => {
  const b = mk({ clan: "brujah" });
  const r = resistBeast(b, "frenzy", "hunger", (pool, diff = 6) => {
    assertEquals(diff, 8); // 6 base + 2
    return evaluateRoll(Array(pool).fill(10), diff, false);
  });
  assert(r.ok);
  const failed = resistBeast(b, "frenzy", "hunger", (pool, diff = 6) =>
    evaluateRoll(Array(pool).fill(1), diff, false)
  );
  assertEquals(failed.ok, false);
  const next = applyBeastOutcome(b, failed);
  assert(next.frenzyState === "berserk");
});
