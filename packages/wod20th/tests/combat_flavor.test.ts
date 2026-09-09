// tests/combat_flavor.test.ts -- automatic mode-based combat prose.
import { assert, assertEquals, assertMatch } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import {
  modeFromNpc,
  modeFromSwitch,
  narrateStrike,
  npcStrikeClause,
  pickVerb,
} from "../core/combatFlavor.ts";

function seqRng(vals: number[]): () => number {
  let i = 0;
  return () => vals[i++ % vals.length]!;
}

describe("combatFlavor", () => {
  it("pickVerb returns v1/v3 for each mode", () => {
    for (const mode of [
      "brawl", "melee", "firearms", "claws", "bite", "psychic",
    ] as const) {
      const v = pickVerb(mode, "homid", () => 0);
      assert(v.v1.length > 0 && v.v3.length > 0);
    }
  });

  it("hit line includes target, weapon name, damage", () => {
    const n = narrateStrike({
      mode: "melee",
      attackerName: "Storms",
      defenderName: "Bran",
      weaponName: "sword",
      dmg: 4,
      dtype: "L",
      outcome: "hit",
      rng: () => 0,
    });
    assertMatch(n.attacker, /You /);
    assertMatch(n.attacker, /Bran/);
    assertMatch(n.attacker, /sword/);
    assertMatch(n.attacker, /4 L/);
    assertMatch(n.room, /Storms/);
  });

  it("unarmed omits weapon clause", () => {
    const n = narrateStrike({
      mode: "brawl",
      attackerName: "A",
      defenderName: "B",
      dmg: 1,
      dtype: "B",
      outcome: "hit",
      rng: () => 0,
    });
    assert(!/ with the /.test(n.attacker));
  });

  it("defended / botch / miss outcomes", () => {
    const d = narrateStrike({
      mode: "brawl",
      attackerName: "A",
      defenderName: "B",
      dmg: 0,
      dtype: "B",
      outcome: "defended",
      defenseKind: "dodge",
      rng: () => 0,
    });
    assertMatch(d.defender, /You /);
    const b = narrateStrike({
      mode: "brawl",
      attackerName: "A",
      defenderName: "B",
      dmg: 0,
      dtype: "B",
      outcome: "botch",
      rng: () => 0,
    });
    assertMatch(b.attacker, /botch/i);
  });

  it("mode mappers + npc clause", () => {
    assertEquals(modeFromSwitch("melee"), "melee");
    assertEquals(modeFromSwitch(""), "brawl");
    assertEquals(modeFromNpc("weapon"), "melee");
    const c = npcStrikeClause({
      mode: "bite",
      defenderName: "Hero",
      dmg: 2,
      dtype: "L",
      rng: () => 0,
    });
    assert(!/^You /.test(c));
    assertMatch(c, /Hero/);
  });

  it("rng varies verbs", () => {
    const a = pickVerb("melee", undefined, seqRng([0]));
    const b = pickVerb("melee", undefined, seqRng([0.9]));
    assert(a.v1 !== b.v1);
  });
});
