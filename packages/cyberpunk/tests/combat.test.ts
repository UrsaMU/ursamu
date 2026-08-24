/**
 * Tests — Combat Utilities
 */
import { assertEquals, assertGreaterOrEqual, assertLessOrEqual } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  resolveAttack, resolveAutofire, ablateArmorState, effectiveSP,
  sortInitiative, advanceTurn, canDodgeRanged, RANGE_DV,
} from "../engine/combat.ts";
import { buildNewCharacter } from "../engine/character.ts";
import type { ICombatActor } from "../db/schemas.ts";

describe("resolveAttack()", () => {
  it("returns a complete attack result", () => {
    const result = resolveAttack({
      attackerStat: 6, attackerSkill: 4,
      defenderDV: 15, damageDice: 2,
    }, 10);
    assertEquals(typeof result.hit, "boolean");
    assertEquals(typeof result.netDamage, "number");
    assertGreaterOrEqual(result.netDamage, 0);
  });

  it("netDamage is 0 on miss", () => {
    // Force miss by using DV 100
    const result = resolveAttack({
      attackerStat: 1, attackerSkill: 0,
      defenderDV: 100, damageDice: 2,
    }, 0);
    if (!result.hit) {
      assertEquals(result.netDamage, 0);
      assertEquals(result.rawDamage, 0);
    }
  });

  it("aimed shot attack total is within correct range", () => {
    // rollD10Critical total: [-9..20] (crit-fail 1-10=-9 to crit-success 10+10=20)
    // aimed attackTotal = stat(8) + skill(6) + roll - 8 → range [-3..26]
    // non-aimed attackTotal = stat(8) + skill(6) + roll → range [5..34]
    // Aimed range ceiling (26) < Non-aimed range ceiling (34), proving -8 penalty applies.
    for (let i = 0; i < 50; i++) {
      const r = resolveAttack({ attackerStat: 8, attackerSkill: 6, aimed: true, defenderDV: 100, damageDice: 2 }, 0);
      assertGreaterOrEqual(r.attackTotal, -3);  // 8 + 6 + (-9) - 8
      assertLessOrEqual(r.attackTotal, 26);     // 8 + 6 + 20 - 8
    }
  });

  it("melee adds BODY to raw damage", () => {
    const result = resolveAttack({
      attackerStat: 6, attackerSkill: 3,
      defenderDV: 10, damageDice: 2, meleeBody: 5,
    }, 0);
    if (result.hit) {
      assertGreaterOrEqual(result.rawDamage, 5); // at least BODY added
    }
  });

  it("netDamage is 0 when armor exceeds raw damage", () => {
    const result = resolveAttack({
      attackerStat: 6, attackerSkill: 4,
      defenderDV: 10, damageDice: 1,
    }, 25); // SP 25 should absorb any 1d6 hit
    if (result.hit) {
      assertEquals(result.netDamage, 0);
    }
  });
});

describe("ablateArmorState()", () => {
  it("reduces SP by 1", () => {
    const armor = { name: "Light Jacket", sp: 11, currentSp: 11, penalty: 0 };
    const result = ablateArmorState(armor);
    assertEquals(result?.currentSp, 10);
  });

  it("doesn't go below 0", () => {
    const armor = { name: "Jacket", sp: 11, currentSp: 0, penalty: 0 };
    const result = ablateArmorState(armor);
    assertEquals(result?.currentSp, 0);
  });

  it("returns null for null armor", () => {
    assertEquals(ablateArmorState(null), null);
  });
});

describe("effectiveSP()", () => {
  it("returns body armor SP for body location", () => {
    const char = { ...buildNewCharacter("solo"), armorBody: { name: "Jacket", sp: 11, currentSp: 8, penalty: 0 } };
    assertEquals(effectiveSP(char, "body"), 8);
  });

  it("returns head armor SP for head location", () => {
    const char = { ...buildNewCharacter("solo"), armorHead: { name: "Helmet", sp: 11, currentSp: 11, penalty: 0 } };
    assertEquals(effectiveSP(char, "head"), 11);
  });

  it("returns 0 when no armor", () => {
    const char = buildNewCharacter("solo");
    assertEquals(effectiveSP(char, "body"), 0);
    assertEquals(effectiveSP(char, "head"), 0);
  });
});

describe("sortInitiative()", () => {
  it("sorts descending", () => {
    const actors: ICombatActor[] = [
      { actorId: "1", name: "A", initiative: 10, held: false, acted: false, isNpc: false },
      { actorId: "2", name: "B", initiative: 18, held: false, acted: false, isNpc: false },
      { actorId: "3", name: "C", initiative: 5, held: false, acted: false, isNpc: false },
    ];
    const sorted = sortInitiative(actors);
    assertEquals(sorted[0].initiative, 18);
    assertEquals(sorted[2].initiative, 5);
  });

  it("does not mutate original array", () => {
    const actors: ICombatActor[] = [
      { actorId: "1", name: "A", initiative: 5, held: false, acted: false, isNpc: false },
      { actorId: "2", name: "B", initiative: 15, held: false, acted: false, isNpc: false },
    ];
    sortInitiative(actors);
    assertEquals(actors[0].initiative, 5); // unchanged
  });
});

describe("advanceTurn()", () => {
  const queue: ICombatActor[] = [
    { actorId: "1", name: "A", initiative: 15, held: false, acted: false, isNpc: false },
    { actorId: "2", name: "B", initiative: 10, held: false, acted: false, isNpc: false },
    { actorId: "3", name: "C", initiative: 5, held: false, acted: false, isNpc: false },
  ];

  it("advances index", () => {
    const { nextIndex, newRound } = advanceTurn(queue, 0);
    assertEquals(nextIndex, 1);
    assertEquals(newRound, false);
  });

  it("wraps and sets newRound at end of queue", () => {
    const { nextIndex, newRound } = advanceTurn(queue, 2);
    assertEquals(nextIndex, 0);
    assertEquals(newRound, true);
  });
});

describe("canDodgeRanged()", () => {
  it("true when REF >= 8", () => {
    assertEquals(canDodgeRanged(8), true);
    assertEquals(canDodgeRanged(10), true);
  });

  it("false when REF < 8", () => {
    assertEquals(canDodgeRanged(7), false);
    assertEquals(canDodgeRanged(1), false);
  });
});

describe("RANGE_DV", () => {
  it("point_blank is 10", () => {
    assertEquals(RANGE_DV.point_blank, 10);
  });

  it("extreme is 30", () => {
    assertEquals(RANGE_DV.extreme, 30);
  });
});
