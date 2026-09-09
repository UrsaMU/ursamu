// tests/combat.test.ts -- resolveAttack unit tests with a mock dice roller.
import { assert, assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import { resolveAttack, type IAttackResult } from "../core/combat.ts";
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
    abilities: { Brawl: 2, Melee: 2, Firearms: 2 },
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 4,
    freebiesRemaining: 0,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

/**
 * Build a roller that returns successive scripted IDiceRoll values.
 * Each entry is the dice array to evaluate; difficulty defaults to 6.
 */
function scriptedRoller(scripts: number[][]): (pool: number, diff?: number) => IDiceRoll {
  let i = 0;
  return (_pool: number, diff = DEFAULT_DIFFICULTY) => {
    const dice = scripts[i++] ?? [];
    return evaluateRoll(dice, diff, false);
  };
}

describe("resolveAttack", () => {
  it("returns the IAttackResult shape", () => {
    const a = makeChar();
    const d = makeChar();
    const res: IAttackResult = resolveAttack(a, d, {
      // attack hits 2, damage hits 3, soak 1 -> final 2
      noDefense: true,
      roller: scriptedRoller([[8, 9, 4], [8, 9, 10, 4], [7, 4]]),
    });
    assertEquals(typeof res.netSuccesses, "number");
    assertEquals(typeof res.finalDamage, "number");
    assert(res.attackRoll);
    assert(res.damageRoll);
    assert(res.soakRoll);
    assertEquals(res.damageType, "B");
  });

  it("net successes floor at 0 when attack fails", () => {
    const a = makeChar();
    const d = makeChar();
    const res = resolveAttack(a, d, {
      // attack: zero successes, no ones -> simple miss
      noDefense: true,
      roller: scriptedRoller([[2, 3, 4, 5]]),
    });
    assertEquals(res.netSuccesses, 0);
    assertEquals(res.finalDamage, 0);
    assertEquals(res.damageRoll, undefined);
    assertEquals(res.soakRoll, undefined);
  });

  it("botch on attack -> finalDamage 0 and no damage/soak rolls", () => {
    const a = makeChar();
    const d = makeChar();
    const res = resolveAttack(a, d, {
      // 3 ones, 0 successes -> botch
      noDefense: true,
      roller: scriptedRoller([[1, 1, 1, 3, 4]]),
    });
    assert(res.attackRoll.botch);
    assertEquals(res.finalDamage, 0);
    assertEquals(res.damageRoll, undefined);
    assertEquals(res.soakRoll, undefined);
  });

  it("damageType propagates from opts", () => {
    const a = makeChar();
    const d = makeChar();
    const res = resolveAttack(a, d, {
      damageType: "L",
      noDefense: true,
      roller: scriptedRoller([[8, 9], [8, 9, 10], [4, 4]]),
    });
    assertEquals(res.damageType, "L");
  });

  it("aggravated damage skips the soak roll", () => {
    const a = makeChar();
    const d = makeChar();
    const res = resolveAttack(a, d, {
      damageType: "A",
      noDefense: true,
      roller: scriptedRoller([[8, 9], [8, 9, 10]]),
    });
    assertEquals(res.damageType, "A");
    assertEquals(res.soakRoll, undefined);
    assertEquals(res.soakedSuccesses, 0);
  });

  it("weaponBonus inflates the damage pool", () => {
    const a = makeChar();
    const d = makeChar();
    let lastPool = -1;
    const dieFns: ((pool: number) => IDiceRoll)[] = [
      // attack: 2 successes
      (_p) => evaluateRoll([8, 9, 4], DEFAULT_DIFFICULTY),
      // damage: capture pool size and return zero hits
      (p) => { lastPool = p; return evaluateRoll(new Array(p).fill(2), DEFAULT_DIFFICULTY); },
      // soak: zero
      (_p) => evaluateRoll([2, 3], DEFAULT_DIFFICULTY),
    ];
    let i = 0;
    const roller: (p: number, d?: number) => IDiceRoll = (p) => dieFns[i++](p);

    resolveAttack(a, d, { weaponBonus: 3, noDefense: true, roller });
    // Strength(1+2=3) + weaponBonus(3) + netSuccesses(2) = 8
    assertEquals(lastPool, 8);
  });

  it("net successes floor at 0 when damage roll yields nothing", () => {
    const a = makeChar();
    const d = makeChar();
    const res = resolveAttack(a, d, {
      // attack 2 hits, damage 0 hits, soak 0 hits
      noDefense: true,
      roller: scriptedRoller([[8, 9, 4], [2, 3, 4, 5], [2, 2]]),
    });
    assert(res.netSuccesses >= 0);
    assertEquals(res.finalDamage, 0);
  });
});
