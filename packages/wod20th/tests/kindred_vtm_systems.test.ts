// tests/kindred_vtm_systems.test.ts -- buff, stake, humanity, feed, bond, embrace.
import { assert, assertEquals } from "@std/assert";
import { bloodBuffAttr, clearBloodBuff } from "../core/bloodBuff.ts";
import { applyStake, pullStake, isStaked } from "../core/stake.ts";
import { humanityCheck, setHumanity } from "../core/humanity.ts";
import { feedFromHerd, feedFromVessel } from "../core/feed.ts";
import { deepenBond, bondLevel, weakenBond } from "../core/bond.ts";
import { embraceMortal, makeGhoul } from "../core/embrace.ts";
import {
  hungerFrenzyCheck,
  kindredBlockMessage,
  applyBeastOutcome,
} from "../core/kindred.ts";
import { effectiveAttr } from "../core/attributes.ts";
import { initTrack } from "../core/health.ts";
import type { IWoDChar } from "../core/types.ts";
import "../splats/vtm/index.ts";

function mk(over: Partial<IWoDChar> = {}): IWoDChar {
  const now = Date.now();
  return {
    id: "k1",
    playerId: "p1",
    splat: "vtm",
    status: "approved",
    chargenStep: 6,
    concept: "x",
    attributePriority: ["", "", ""],
    attributes: { Strength: 2, Dexterity: 1, Stamina: 1 },
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {},
    abilitySpecialties: {},
    backgrounds: { Herd: 3 },
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
    bloodPool: 8,
    bloodPerTurn: 1,
    disciplines: {},
    virtues: { Conscience: 3, "Self-Control": 3, Courage: 3 },
    humanity: 7,
    healthTrack: initTrack(),
    ...over,
  };
}

function mkMortal(over: Partial<IWoDChar> = {}): IWoDChar {
  return mk({
    id: "m1",
    splat: "mortal",
    bloodMax: undefined,
    bloodPool: undefined,
    bloodPerTurn: undefined,
    clan: undefined,
    generation: undefined,
    disciplines: undefined,
    backgrounds: {},
    humanity: undefined,
    ...over,
  });
}

Deno.test("bloodBuff raises Strength and spends 1 BP", () => {
  const c = mk({ bloodPool: 5, bloodPerTurn: 2 });
  const r = bloodBuffAttr(c, "Strength");
  assert(r.ok);
  assertEquals(c.bloodPool, 4);
  assertEquals(c.bloodBuff?.Strength, 1);
  assertEquals(effectiveAttr(c, "Strength"), 4); // 1+2+1
});

Deno.test("clearBloodBuff removes buffs", () => {
  const c = mk({ bloodBuff: { Dexterity: 2 } });
  assert(clearBloodBuff(c).ok);
  assertEquals(c.bloodBuff, undefined);
});

Deno.test("stake blocks actions", () => {
  const c = mk();
  assert(applyStake(c).ok);
  assert(isStaked(c));
  assert(kindredBlockMessage(c, "attack")?.includes("staked"));
  assert(pullStake(c).ok);
  assertEquals(isStaked(c), false);
});

Deno.test("humanityCheck loses on fail", () => {
  const c = mk({ humanity: 7 });
  const r = humanityCheck(c, 4, (pool, diff) => ({
    pool,
    difficulty: diff,
    dice: Array(pool).fill(1),
    successes: 0,
    netSuccesses: 0,
    botch: true,
    tens: 0,
    ones: pool,
  }));
  assert(r.ok);
  assert(r.lost);
  assertEquals(c.humanity, 6);
});

Deno.test("humanityCheck skips when sin >= humanity", () => {
  const c = mk({ humanity: 5 });
  const r = humanityCheck(c, 8);
  assert(r.ok);
  assertEquals(r.lost, false);
  assertEquals(c.humanity, 5);
});

Deno.test("feedFromHerd uses Herd dots", () => {
  const c = mk({ bloodPool: 2, backgrounds: { Herd: 2 } });
  const r = feedFromHerd(c, 2);
  assert(r.ok);
  assertEquals(c.bloodPool, 4);
});

Deno.test("feedFromVessel damages mortal", () => {
  const p = mk({ bloodPool: 2, id: "pred" });
  const v = mkMortal({ id: "ves" });
  const r = feedFromVessel(p, v, 2);
  assert(r.ok);
  assertEquals(p.bloodPool, 4);
  assertEquals(r.vesselDamage, 2);
});

Deno.test("deepenBond stacks to 3", () => {
  const t = mkMortal({ id: "thrall" });
  const r = mk({ id: "reg" });
  assertEquals(deepenBond(t, r).level, 1);
  assertEquals(deepenBond(t, r).level, 2);
  assertEquals(deepenBond(t, r).level, 3);
  assertEquals(bondLevel(t, "reg"), 3);
  assertEquals(weakenBond(t, "reg", true).level, 0);
});

Deno.test("embraceMortal makes neonate", () => {
  const sire = mk({ id: "sire", generation: 12, clan: "nosferatu" });
  const childe = mkMortal({ id: "childe" });
  const r = embraceMortal(sire, childe);
  assert(r.ok);
  assertEquals(childe.splat, "vtm");
  assertEquals(childe.generation, 13);
  assertEquals(childe.clan, "nosferatu");
  assert(childe.bloodMax! > 0);
});

Deno.test("makeGhoul sets pool and bond", () => {
  const d = mk({ id: "dom" });
  const g = mkMortal({ id: "gh" });
  assert(makeGhoul(d, g).ok);
  assert(g.isGhoul);
  assertEquals(g.domitorId, "dom");
  assertEquals(g.bloodMax, 2);
  assertEquals(bondLevel(g, "dom"), 1);
});

Deno.test("hungerFrenzyCheck when empty", () => {
  const c = mk({ bloodPool: 0 });
  const check = hungerFrenzyCheck(c, (pool, diff) => ({
    pool,
    difficulty: diff,
    dice: [1, 1, 1],
    successes: 0,
    netSuccesses: 0,
    botch: true,
    tens: 0,
    ones: 3,
  }));
  assert(check);
  assertEquals(check.ok, false);
  const next = applyBeastOutcome(c, check);
  assertEquals(next.frenzyState, "berserk");
});

Deno.test("setHumanity bounds", () => {
  const c = mk();
  assertEquals(setHumanity(c, 11).ok, false);
  assert(setHumanity(c, 3).ok);
  assertEquals(c.humanity, 3);
});
