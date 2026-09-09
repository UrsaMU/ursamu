// tests/rituals.test.ts -- VtM blood-magic ritual catalog + casting.
import { assert, assertEquals } from "@std/assert";

import "../splats/vtm/index.ts";
import "../splats/mortal/index.ts";
import {
  ALL_RITUALS,
  getRitual,
  ritualsForSchool,
} from "../splats/vtm/data/rituals.ts";
import {
  castRitual,
  forgetRitual,
  knowsRitual,
  knownRituals,
  learnRitual,
  ritualCastTime,
  schoolRating,
} from "../core/vtmRituals.ts";
import { evaluateRoll } from "../core/dice.ts";
import type { IWoDChar } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mkTremere(over: Partial<IWoDChar> = {}): IWoDChar {
  const now = Date.now();
  return {
    id: "rit-1",
    playerId: "player-1",
    splat: "vtm",
    status: "approved",
    chargenStep: 6,
    concept: "Warlock",
    attributePriority: ["mental", "social", "physical"],
    attributes: { Intelligence: 3 }, // effective 4
    attributeSpecialties: {},
    abilityPriority: ["knowledges", "skills", "talents"],
    abilities: { Occult: 3 },
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 5,
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    staffNotes: "",
    statLog: [],
    notes: [],
    createdAt: now,
    updatedAt: now,
    clan: "tremere",
    generation: 12,
    bloodMax: 11,
    bloodPool: 10,
    bloodPerTurn: 2,
    disciplines: { Thaumaturgy: 3 },
    virtues: { Conscience: 3, "Self-Control": 3, Courage: 3 },
    humanity: 7,
    healthTrack: [],
    ...over,
  } as IWoDChar;
}

// ---------------------------------------------------------------------------

Deno.test("ritual catalog: both schools, levels 1-5", OPTS, () => {
  const t = ritualsForSchool("thaumaturgy");
  const n = ritualsForSchool("necromancy");
  assert(t.length >= 30, `thaumaturgy rituals: ${t.length}`);
  assert(n.length >= 20, `necromancy rituals: ${n.length}`);
  for (const lvl of [1, 2, 3, 4, 5]) {
    assert(t.some((r) => r.level === lvl), `thaum L${lvl} missing`);
    assert(n.some((r) => r.level === lvl), `necro L${lvl} missing`);
  }
  // No duplicate slugs
  const slugs = ALL_RITUALS.map((r) => r.slug);
  assertEquals(new Set(slugs).size, slugs.length);
});

Deno.test("getRitual fuzzy lookup", OPTS, () => {
  assertEquals(getRitual("pavis of foul presence")?.slug, "pavis-of-foul-presence");
  assertEquals(getRitual("Pavis of Foul Presence")?.slug, "pavis-of-foul-presence");
  assertEquals(getRitual("wake-with-evenings-freshness")?.level, 1);
  assertEquals(getRitual("nonsense-ritual"), undefined);
});

Deno.test("learnRitual respects school rating cap", OPTS, () => {
  const c = mkTremere(); // Thaumaturgy 3
  // L3 ritual OK
  const ok = learnRitual(c, "pavis of foul presence");
  assert(ok.ok, ok.message);
  assertEquals(ok.rituals, ["pavis-of-foul-presence"]);
  // L4 ritual blocked
  const no = learnRitual(c, "ward versus kindred");
  assertEquals(no.ok, false);
  assert(/Level 4/.test(no.message));
  // Necromancy ritual blocked (rating 0)
  const necro = learnRitual(c, "insight");
  assertEquals(necro.ok, false);
});

Deno.test("learnRitual bypassCap (staff teach)", OPTS, () => {
  const c = mkTremere();
  const r = learnRitual(c, "ward versus kindred", { bypassCap: true });
  assert(r.ok, r.message);
});

Deno.test("learn/forget round-trip + duplicate guard", OPTS, () => {
  const c = mkTremere();
  const r = learnRitual(c, "blood rush");
  assert(r.ok);
  c.rituals = r.rituals; // pure core returns new array; caller persists
  const dup = learnRitual(c, "blood rush");
  assertEquals(dup.ok, false);
  assert(knowsRitual(c, "blood-rush"));
  const f = forgetRitual(c, "blood rush");
  assert(f.ok);
  c.rituals = f.rituals;
  assert(!knowsRitual(c, "blood-rush"));
});

Deno.test("knownRituals resolves defs", OPTS, () => {
  const c = mkTremere();
  c.rituals = ["blood-rush", "pavis-of-foul-presence"];
  const defs = knownRituals(c);
  assertEquals(defs.length, 2);
  assertEquals(defs[0].name, "Blood Rush");
});

Deno.test("castRitual: unknown ritual rejected", OPTS, () => {
  const c = mkTremere();
  const r = castRitual(c, "blood rush");
  assertEquals(r.ok, false);
  assert(/don't know/.test(r.message));
});

Deno.test("castRitual: Int+Occult vs 3+level, blood spent, flag set", OPTS, () => {
  const c = mkTremere({ rituals: ["defense-of-the-sacred-haven"] });
  // Int eff 4 + Occult 3 = 7 dice vs diff 4 (L1); blood cost 1
  const r = castRitual(c, "defense of the sacred haven", {
    rng: (pool, diff = 6) =>
      evaluateRoll([8, 9, 7, 8, 2, 3, 4].slice(0, pool), diff, false),
  });
  assert(r.ok, r.message);
  assertEquals(r.difficulty, 4);
  assertEquals(c.bloodPool, 9);
  assertEquals(c.powerFlags?.sacredHaven, true);
  assert(r.rollLine?.includes("Int+Occult"), r.rollLine ?? "");
});

Deno.test("castRitual: L5 difficulty is 8 (3 + level, V20 p.230)", OPTS, () => {
  const c = mkTremere({
    disciplines: { Thaumaturgy: 5 },
    rituals: ["blood-contract"],
    bloodPool: 11,
  });
  const r = castRitual(c, "blood contract", {
    rng: (pool, diff = 6) =>
      evaluateRoll(Array(pool).fill(9), diff, false),
  });
  assert(r.ok, r.message);
  assertEquals(r.difficulty, 8);
});

Deno.test("castRitual: botch reports failure", OPTS, () => {
  const c = mkTremere({ rituals: ["blood-rush"] });
  const r = castRitual(c, "blood rush", {
    rng: (pool, diff = 6) => evaluateRoll([1, 1, 2, 2, 3, 3, 2].slice(0, pool), diff, false),
  });
  assertEquals(r.ok, false);
  assertEquals(r.botch, true);
});

Deno.test("castRitual: school rating gate", OPTS, () => {
  const c = mkTremere({ rituals: ["ward-versus-kindred"] }); // L4 > rating 3
  const r = castRitual(c, "ward versus kindred");
  assertEquals(r.ok, false);
  assert(/requires Thaumaturgy 4/.test(r.message));
});

Deno.test("castRitual: frenzy blocks casting", OPTS, () => {
  const c = mkTremere({ rituals: ["blood-rush"], frenzyState: "berserk" });
  const r = castRitual(c, "blood rush");
  assertEquals(r.ok, false);
  assert(/frenzy/i.test(r.message));
});

Deno.test("castRitual: insufficient blood", OPTS, () => {
  const c = mkTremere({ rituals: ["enchant-talisman"], disciplines: { Thaumaturgy: 5 }, bloodPool: 3 });
  const r = castRitual(c, "enchant talisman"); // 28 BP
  assertEquals(r.ok, false);
  assert(/Insufficient/.test(r.message));
});

Deno.test("castRitual: mortals cannot cast", OPTS, () => {
  const c = mkTremere({ splat: "mortal" });
  c.rituals = ["blood-rush"];
  const r = castRitual(c, "blood rush");
  assertEquals(r.ok, false);
  assert(/Only Kindred/.test(r.message));
});

Deno.test("schoolRating reads disciplines", OPTS, () => {
  const c = mkTremere({ disciplines: { Thaumaturgy: 2, Necromancy: 1 } });
  assertEquals(schoolRating(c, "thaumaturgy"), 2);
  assertEquals(schoolRating(c, "necromancy"), 1);
});

Deno.test("ritualCastTime default + override", OPTS, () => {
  assertEquals(ritualCastTime(getRitual("blood rush")!), "1 turn");
  assertEquals(ritualCastTime(getRitual("purity of flesh")!), "5 minutes");
  assertEquals(ritualCastTime(getRitual("pavis of foul presence")!), "15 minutes");
});
