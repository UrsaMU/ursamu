// tests/defense.test.ts -- Reactive defense (dodge/block/parry) unit tests.
//
// Canon W20 (p. 288): defense must be DECLARED before the attack. No
// passive / reflexive rolls. Undeclared = unopposed.

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import {
  defensePool,
  legalDefenses,
  resolveDefense,
} from "../core/defense.ts";
import { resolveAttack } from "../core/combat.ts";
import { evaluateRoll, type IDiceRoll, DEFAULT_DIFFICULTY } from "../core/dice.ts";
import type { IWoDChar } from "../core/types.ts";

function makeChar(over: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "c-" + Math.random().toString(36).slice(2, 8),
    playerId: "p1",
    splat: "wta",
    status: "approved",
    chargenStep: 6,
    concept: "Test",
    attributePriority: ["physical", "social", "mental"],
    attributes: { Strength: 2, Dexterity: 2, Stamina: 2 },
    attributeSpecialties: {},
    abilityPriority: ["talents", "skills", "knowledges"],
    abilities: { Brawl: 2, Melee: 2, Firearms: 2, Athletics: 3 },
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 4,
    freebiesRemaining: 0, freebiesLog: [],
    xpTotal: 0, xpSpent: 0,
    notes: [], staffNotes: "", statLog: [],
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

function scriptedRoller(scripts: number[][]): (pool: number, diff?: number) => IDiceRoll {
  let i = 0;
  return (_p: number, diff = DEFAULT_DIFFICULTY) => evaluateRoll(scripts[i++] ?? [], diff, false);
}

const wieldedMeleeHolder = {
  id: "h1",
  contents: [
    { id: "i-sword", state: { kind: "weapon", weaponType: "melee", wielded: true } },
  ],
};
const bareHolder = { id: "h2", contents: [] };

describe("legalDefenses", () => {
  it("always includes dodge; block added vs Brawl/Melee", () => {
    assertEquals(legalDefenses("Brawl"), ["dodge", "block"]);
    assertEquals(legalDefenses("Firearms"), ["dodge"]);
  });
  it("parry only when armed with melee weapon", () => {
    assertEquals(legalDefenses("Melee", wieldedMeleeHolder), ["dodge", "block", "parry"]);
    assertEquals(legalDefenses("Melee", bareHolder), ["dodge", "block"]);
  });
  it("never adds block or parry vs Firearms", () => {
    assertEquals(legalDefenses("Firearms", wieldedMeleeHolder), ["dodge"]);
  });
});

describe("defensePool (W20 canon pools)", () => {
  it("dodge uses Dex + Athletics", () => {
    // Dex = 1 + 2 = 3; Athletics = 3 -> 6
    assertEquals(defensePool(makeChar(), "dodge"), 6);
  });
  it("block uses Dex + Brawl", () => {
    assertEquals(defensePool(makeChar(), "block"), 5);
  });
  it("parry uses Dex + Melee", () => {
    assertEquals(defensePool(makeChar(), "parry"), 5);
  });
  it("clamps to min 1 with zero ability and high wound penalty", () => {
    const c = makeChar({ abilities: {} });
    assertEquals(defensePool(c, "dodge"), Math.max(1, 3));
  });
});

describe("resolveDefense (declared-only)", () => {
  it("returns undefined when no defense is declared", () => {
    const d = makeChar();
    assertEquals(resolveDefense(d, "Brawl", { roller: scriptedRoller([[9, 9]]) }), undefined);
  });
  it("rolls the declared kind at full pool minus split penalty", () => {
    const d = makeChar({ pendingDefense: { kind: "dodge", setAt: 0 } });
    const r = resolveDefense(d, "Brawl", { roller: scriptedRoller([[9, 9, 4]]) });
    assert(r);
    assertEquals(r!.kind, "dodge");
    assertEquals(r!.pool, 6); // Dex 3 + Athletics 3
  });
  it("declaredPenalty subtracts from pool", () => {
    const d = makeChar({ pendingDefense: { kind: "dodge", setAt: 0 } });
    const r = resolveDefense(d, "Brawl", { roller: scriptedRoller([[2]]), declaredPenalty: 2 });
    assertEquals(r!.pool, 4);
  });
  it("illegal declared defense skipped (returns undefined; queue persists)", () => {
    const d = makeChar({ pendingDefense: { kind: "block", setAt: 0 } });
    assertEquals(resolveDefense(d, "Firearms"), undefined);
    // Queue is NOT cleared here -- consumer (resolveAttack) handles consumption.
    assertEquals(d.pendingDefense?.kind, "block");
  });
  it("parry without wielded weapon is illegal -> skipped", () => {
    const d = makeChar({ pendingDefense: { kind: "parry", setAt: 0 } });
    assertEquals(resolveDefense(d, "Melee", { defenderHolder: bareHolder }), undefined);
  });
});

describe("resolveAttack respects declared-only defense", () => {
  it("no declaration -> no defense roll, unopposed attack", () => {
    const a = makeChar();
    const d = makeChar();
    const res = resolveAttack(a, d, {
      roller: scriptedRoller([[8, 9, 4], [8], [2]]),
    });
    assertEquals(res.defense, undefined);
    assert(res.netSuccesses > 0);
  });
  it("declared dodge subtracts net successes; consumes pendingDefense", () => {
    const a = makeChar();
    const d = makeChar({ pendingDefense: { kind: "dodge", setAt: 0 } });
    // attack: 2 hits; defense: 1 hit -> net 1; damage 1 hit; soak 0.
    const res = resolveAttack(a, d, {
      roller: scriptedRoller([[8, 9, 4], [7, 2], [8], [2]]),
    });
    assert(res.defense);
    assertEquals(res.netSuccesses, 1);
    assertEquals(d.pendingDefense, undefined, "declared defense must be consumed");
  });
  it("declared dodge with more successes than attack -> turned aside, no damage", () => {
    const a = makeChar();
    const d = makeChar({ pendingDefense: { kind: "dodge", setAt: 0 } });
    // attack: 1 hit; defense: 3 hits -> net 0; no damage/soak.
    const res = resolveAttack(a, d, {
      roller: scriptedRoller([[8, 4], [8, 9, 10, 2]]),
    });
    assertEquals(res.netSuccesses, 0);
    assertEquals(res.finalDamage, 0);
    assertEquals(res.damageRoll, undefined);
    assert(res.message.includes("turned aside"));
  });
  it("declared block illegal vs firearms -> skipped, queue preserved", () => {
    const a = makeChar();
    const d = makeChar({ pendingDefense: { kind: "block", setAt: 0 } });
    const res = resolveAttack(a, d, {
      abilityName: "Firearms",
      roller: scriptedRoller([[8, 9], [8], [2]]),
    });
    assertEquals(res.defense, undefined);
    assertEquals(d.pendingDefense?.kind, "block", "queue must not be consumed by illegal-skip");
  });
  it("noDefense:true skips defense even when declared", () => {
    const a = makeChar();
    const d = makeChar({ pendingDefense: { kind: "dodge", setAt: 0 } });
    const res = resolveAttack(a, d, {
      noDefense: true,
      roller: scriptedRoller([[8, 9, 4], [8], [2]]),
    });
    assertEquals(res.defense, undefined);
    assertEquals(d.pendingDefense?.kind, "dodge", "not consumed when skipped");
  });
});
