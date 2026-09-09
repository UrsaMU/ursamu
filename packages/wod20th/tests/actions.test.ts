// tests/actions.test.ts -- Pool-splitting state machine + combat penalty.
import { assert, assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import {
  clearActionDecl,
  consumeAction,
  declareSplit,
  slotsRemaining,
  splitPenalty,
} from "../core/actions.ts";
import { resolveAttack } from "../core/combat.ts";
import { evaluateRoll, type IDiceRoll, DEFAULT_DIFFICULTY } from "../core/dice.ts";
import type { IWoDChar } from "../core/types.ts";

function makeChar(over: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "c-" + Math.random().toString(36).slice(2, 8),
    playerId: "p1",
    splat: "wta", status: "approved", chargenStep: 6,
    concept: "Test",
    attributePriority: ["physical", "social", "mental"],
    attributes: { Strength: 2, Dexterity: 2, Stamina: 2 },
    attributeSpecialties: {},
    abilityPriority: ["talents", "skills", "knowledges"],
    abilities: { Brawl: 2, Melee: 2, Firearms: 2, Dodge: 3 },
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

describe("splitPenalty", () => {
  it("0 when no declaration", () => {
    assertEquals(splitPenalty(makeChar()), 0);
  });
  it("0 when count is 1", () => {
    const c = makeChar();
    declareSplit(c, 1);
    assertEquals(splitPenalty(c), 0);
  });
  it("(count - 1) for splits", () => {
    const c = makeChar();
    declareSplit(c, 2);
    assertEquals(splitPenalty(c), 1);
    declareSplit(c, 3);
    assertEquals(splitPenalty(c), 2);
    declareSplit(c, 5);
    assertEquals(splitPenalty(c), 4);
  });
  it("clamps to floor(n) and min 1", () => {
    const c = makeChar();
    declareSplit(c, 0);
    assertEquals(c.actionDecl?.count, 1);
    declareSplit(c, 2.7);
    assertEquals(c.actionDecl?.count, 2);
  });
});

describe("consumeAction", () => {
  it("no-op when no decl", () => {
    const c = makeChar();
    assertEquals(consumeAction(c), false);
    assertEquals(c.actionDecl, undefined);
  });
  it("increments used and clears when exhausted", () => {
    const c = makeChar();
    declareSplit(c, 2);
    assertEquals(consumeAction(c), false);
    assertEquals(c.actionDecl?.used, 1);
    assertEquals(consumeAction(c), true);
    assertEquals(c.actionDecl, undefined);
  });
  it("slotsRemaining tracks usage", () => {
    const c = makeChar();
    declareSplit(c, 3);
    assertEquals(slotsRemaining(c), 3);
    consumeAction(c);
    assertEquals(slotsRemaining(c), 2);
  });
  it("Infinity when no decl", () => {
    assertEquals(slotsRemaining(makeChar()), Number.POSITIVE_INFINITY);
  });
});

describe("clearActionDecl", () => {
  it("drops without consuming", () => {
    const c = makeChar();
    declareSplit(c, 3);
    clearActionDecl(c);
    assertEquals(c.actionDecl, undefined);
  });
});

describe("resolveAttack honors attackerPenalty", () => {
  it("attack pool shrinks by attackerPenalty", () => {
    const a = makeChar();
    const d = makeChar();
    let seenAttackPool = -1;
    const roller = (pool: number, _d?: number) => {
      if (seenAttackPool === -1) seenAttackPool = pool;
      return evaluateRoll([2], DEFAULT_DIFFICULTY, false);
    };
    // Base attack pool = Dex 3 + Brawl 2 = 5. Penalty 2 -> 3.
    resolveAttack(a, d, { attackerPenalty: 2, noDefense: true, roller });
    assertEquals(seenAttackPool, 3);
  });
  it("attackerPenalty cannot drop below 1", () => {
    const a = makeChar();
    const d = makeChar();
    let seenAttackPool = -1;
    const roller = (pool: number, _d?: number) => {
      if (seenAttackPool === -1) seenAttackPool = pool;
      return evaluateRoll([2], DEFAULT_DIFFICULTY, false);
    };
    resolveAttack(a, d, { attackerPenalty: 999, noDefense: true, roller });
    assert(seenAttackPool >= 1);
  });
});

describe("declared defense pool shrinks by defender's splitPenalty", () => {
  it("declared dodge with +split 2 rolls Dex+Athletics-1", () => {
    const a = makeChar();
    const d = makeChar({
      pendingDefense: { kind: "dodge", setAt: 0 },
      abilities: { Athletics: 3, Brawl: 2, Melee: 2, Firearms: 2 },
    });
    declareSplit(d, 2); // penalty 1
    let defensePool = -1;
    let nthRoll = 0;
    const roller = (pool: number, _d?: number) => {
      nthRoll++;
      // 1 = attack, 2 = defense
      if (nthRoll === 2) defensePool = pool;
      return evaluateRoll([2], DEFAULT_DIFFICULTY, false);
    };
    resolveAttack(a, d, { roller });
    // Base dodge pool = Dex 3 + Athletics 3 = 6; -1 split = 5.
    assertEquals(defensePool, 5);
  });
});

describe("scenario: split 2 = attack + declared defense, each at -1", () => {
  it("attacker and defender each lose 1 die on their declared rolls", () => {
    const a = makeChar();
    const d = makeChar({
      pendingDefense: { kind: "dodge", setAt: 0 },
      abilities: { Athletics: 3, Brawl: 2, Melee: 2, Firearms: 2 },
    });
    declareSplit(a, 2); // attacker pays -1 on attack
    declareSplit(d, 2); // defender pays -1 on declared dodge

    let attackPool = -1, defensePool = -1;
    let nth = 0;
    const roller = (pool: number, _d?: number) => {
      nth++;
      if (nth === 1) attackPool = pool;
      if (nth === 2) defensePool = pool;
      return evaluateRoll([2], DEFAULT_DIFFICULTY, false);
    };
    resolveAttack(a, d, { attackerPenalty: 1, roller });
    // Attack: Dex 3 + Brawl 2 - 1 = 4
    assertEquals(attackPool, 4);
    // Defense: Dex 3 + Athletics 3 - 1 = 5
    assertEquals(defensePool, 5);
  });
});
