// tests/kindred.test.ts -- Kindred loop pure helpers.
import { assert, assertEquals } from "@std/assert";
import {
  bloodFeed,
  bloodHeal,
  bloodHealAgg,
  countDamage,
  isInTorpor,
  isKindred,
  kindredBlockMessage,
  maybeEnterTorpor,
  resistBeast,
} from "../core/kindred.ts";
import { applyDamage, initTrack } from "../core/health.ts";
import {
  useDiscipline,
  useDisciplinePower,
  listDisciplines,
} from "../core/disciplineUse.ts";
import {
  activateCelerity,
  consumeCelerityAction,
  potenceAutoSuccesses,
  fortitudeSoakBonus,
  kindredSoakDice,
} from "../core/disciplineCombat.ts";
import { applyHazard } from "../core/hazard.ts";
import { xpCost } from "../core/xp.ts";
import type { IWoDChar } from "../core/types.ts";
import "../splats/vtm/index.ts";

function mkVtm(over: Partial<IWoDChar> = {}): IWoDChar {
  const now = Date.now();
  return {
    id: "v1",
    playerId: "p1",
    splat: "vtm",
    status: "approved",
    chargenStep: 6,
    concept: "neonate",
    attributePriority: ["", "", ""],
    attributes: {},
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {},
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 5,
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 50,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: now,
    updatedAt: now,
    clan: "brujah",
    generation: 13,
    bloodMax: 10,
    bloodPool: 10,
    bloodPerTurn: 1,
    disciplines: { Potence: 2, Presence: 1 },
    virtues: { Conscience: 3, "Self-Control": 3, Courage: 4 },
    humanity: 6,
    healthTrack: initTrack(),
    ...over,
  };
}

Deno.test("isKindred / bloodHeal prefers bashing", () => {
  const c = mkVtm({ bloodPool: 5, bloodPerTurn: 3 });
  applyDamage(c, "B", 2);
  applyDamage(c, "L", 1);
  assertEquals(countDamage(c, "B"), 2);
  const r = bloodHeal(c, 2);
  assert(r.ok);
  assertEquals(r.healed, 2);
  assertEquals(countDamage(c, "B"), 0);
  assertEquals(c.bloodPool, 3);
});

Deno.test("bloodHeal blocked in torpor", () => {
  const c = mkVtm({ bloodPool: 5, inTorpor: true });
  applyDamage(c, "B", 1);
  const r = bloodHeal(c, 1);
  assertEquals(r.ok, false);
  assert(/torpor/i.test(r.message));
});

Deno.test("bloodFeed regains", () => {
  const c = mkVtm({ bloodPool: 2 });
  const r = bloodFeed(c, 3);
  assert(r.ok);
  assertEquals(c.bloodPool, 5);
});

Deno.test("maybeEnterTorpor on incap L", () => {
  const c = mkVtm();
  applyDamage(c, "L", 7);
  assert(maybeEnterTorpor(c));
  assert(isInTorpor(c));
});

Deno.test("useDiscipline rejects passive Potence", () => {
  const c = mkVtm({ bloodPool: 4 });
  const r = useDiscipline(c, "Potence");
  assertEquals(r.ok, false);
  assert(/passive/i.test(r.message));
  assertEquals(c.bloodPool, 4);
  assertEquals(listDisciplines(c).length, 2);
});

Deno.test("useDisciplinePower Awe spends 0 blood + rolls", () => {
  const c = mkVtm({
    bloodPool: 4,
    attributes: { Charisma: 2 },
    disciplines: { Presence: 1 },
  });
  const r = useDisciplinePower(c, "Awe");
  assert(r.ok);
  assertEquals(c.bloodPool, 4);
  assert(r.rollLine);
});

Deno.test("bloodHealAgg costs 5 BP ignoring per-turn", () => {
  const c = mkVtm({ bloodPool: 8, bloodPerTurn: 1 });
  applyDamage(c, "A", 2);
  const r = bloodHealAgg(c, 1);
  assert(r.ok);
  assertEquals(r.healed, 1);
  assertEquals(c.bloodPool, 3);
  assertEquals(countDamage(c, "A"), 1);
});

Deno.test("Celerity banks and consumes extra actions", () => {
  const c = mkVtm({
    bloodPool: 5,
    bloodPerTurn: 2,
    disciplines: { Celerity: 2, Potence: 1 },
  });
  const a = activateCelerity(c, 2);
  assert(a.ok);
  assertEquals(c.celerityActions, 2);
  assertEquals(c.bloodPool, 3);
  assert(consumeCelerityAction(c));
  assertEquals(c.celerityActions, 1);
  assert(consumeCelerityAction(c));
  assertEquals(c.celerityActions, undefined);
  assertEquals(consumeCelerityAction(c), false);
});

Deno.test("Potence / Fortitude combat helpers", () => {
  const c = mkVtm({
    disciplines: { Potence: 3, Fortitude: 2 },
    attributes: { Stamina: 2 },
  });
  assertEquals(potenceAutoSuccesses(c), 3);
  assertEquals(fortitudeSoakBonus(c), 2);
  assertEquals(kindredSoakDice(c, "B", 3), 5);
  assertEquals(kindredSoakDice(c, "A", 3), 2);
  const mortal = mkVtm({ splat: "wta" as const, disciplines: {} });
  assertEquals(kindredSoakDice(mortal, "A", 3), 0);
});

Deno.test("applyHazard fire deals agg + torpor path", () => {
  const c = mkVtm();
  applyDamage(c, "L", 6);
  const r = applyHazard(c, "fire", 1);
  assert(r.ok);
  assertEquals(r.applied, 1);
  assert(r.enteredTorpor);
  assert(isInTorpor(c));
  assert(/beast\/fear fire/i.test(r.fearHint ?? ""));
});

Deno.test("resistBeast frenzy can succeed", () => {
  const c = mkVtm();
  // Force success: pool 10 vs low diff with fixed dice of 10s
  const r = resistBeast(c, "frenzy", "hunger", (pool, diff) => ({
    pool,
    difficulty: diff,
    dice: Array(pool).fill(10),
    successes: pool,
    netSuccesses: pool,
    botch: false,
    tens: pool,
    ones: 0,
  }));
  assert(r.ok);
});

Deno.test("VtM XP costs for discipline and humanity", () => {
  const c = mkVtm({ disciplines: { Potence: 2 }, humanity: 5 });
  assertEquals(xpCost(c, "disciplines.Potence"), 10); // 2*5
  assertEquals(xpCost(c, "humanity"), 10); // 5*2
  const empty = mkVtm({ disciplines: {} });
  assertEquals(xpCost(empty, "disciplines.Auspex"), 10); // new
});

Deno.test("kindredBlockMessage frenzy", () => {
  const c = mkVtm({ frenzyState: "berserk", frenzyUntil: 0 });
  const m = kindredBlockMessage(c, "feed");
  assert(m && /frenzy/i.test(m));
});
