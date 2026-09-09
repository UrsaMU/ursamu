// tests/attack_weapons_audit.test.ts -- /tdd-audit security pass for the
// +attack weapon flow (commands/attack.ts + core/combat.ts).
//
// The exploit surface is the /melee, /firearms, /claws switch wiring to
// the wielded-weapon scan introduced when state.kind === "weapon"
// became authoritative. We assert source-level gates plus pure helpers.
import { assert, assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import { pickWielded } from "../commands/attack.ts";
import { defaultDamageType } from "../core/eq.ts";
import { resolveAttack } from "../core/combat.ts";
import { evaluateRoll, type IDiceRoll } from "../core/dice.ts";
import type { IWoDChar } from "../core/types.ts";

const ATTACK_SRC = await Deno.readTextFile(
  new URL("../commands/attack.ts", import.meta.url),
);

// deno-lint-ignore no-explicit-any
function item(name: string, state: Record<string, any>): any {
  return { id: "i-" + name, name, state, contents: [] };
}
// deno-lint-ignore no-explicit-any
function holder(contents: any[]): any { return { id: "h", contents }; }

function mkChar(over: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "c", playerId: "p", splat: "wta", status: "approved", chargenStep: 6,
    concept: "",
    attributePriority: ["", "", ""] as [string, string, string],
    attributes: { Dexterity: 2, Strength: 2, Stamina: 2 }, attributeSpecialties: {},
    abilityPriority: ["", "", ""] as [string, string, string],
    abilities: { Brawl: 2, Melee: 2, Firearms: 2 }, abilitySpecialties: {},
    backgrounds: {},
    willpower: 5, rage: 3, gnosis: 3,
    freebiesRemaining: 0, freebiesLog: [],
    xpTotal: 0, xpSpent: 0, notes: [], staffNotes: "",
    statLog: [], createdAt: 0, updatedAt: 0,
    ...over,
  };
}

function fixed(dice: number[]) {
  return (_pool: number, difficulty?: number): IDiceRoll =>
    evaluateRoll(dice, difficulty ?? 6, false);
}

describe("/tdd-audit +attack weapon flow", () => {
  // A-1: /melee without wielded melee weapon -> reject.
  it("A-1: pickWielded returns undefined for /melee w/o weapon", () => {
    assertEquals(pickWielded(holder([]), "melee"), undefined);
    // Source guard: command must surface a refusal.
    assert(
      /You need to wield/i.test(ATTACK_SRC),
      "command must refuse missing weapon with a clear message",
    );
  });

  // A-2: /firearms without wielded firearm -> reject.
  it("A-2: pickWielded returns undefined for /firearms w/o firearm", () => {
    const a = holder([item("sword", {
      kind: "weapon", weaponType: "melee", wielded: true,
    })]);
    assertEquals(pickWielded(a, "firearms"), undefined);
  });

  // A-3: /claws works regardless of wielded items.
  it("A-3: /claws path does not call pickWielded (no weapon gate)", () => {
    // Source check: the gate is keyed on sw === "melee" || sw === "firearms".
    // /claws must skip the gate.
    assert(
      /sw === "melee" \|\| sw === "firearms"/.test(ATTACK_SRC),
      "weapon gate must apply ONLY to /melee and /firearms",
    );
    assert(
      !/sw === "claws"[^}]*pickWielded/.test(ATTACK_SRC),
      "/claws must not require a wielded weapon",
    );
  });

  // A-4: deterministic pick when multiple wielded weapons match.
  it("A-4: picks the first matching wielded weapon (deterministic)", () => {
    const a = holder([
      item("axe",   { kind: "weapon", weaponType: "melee", damage: 2, wielded: true }),
      item("knife", { kind: "weapon", weaponType: "melee", damage: 1, wielded: true }),
    ]);
    assertEquals(pickWielded(a, "melee")?.name, "axe");
  });

  // A-5: weapon's damageType propagates to resolveAttack; default by type.
  it("A-5: damageType defaults brawl->B, others->L when weapon unspecified", () => {
    assertEquals(defaultDamageType("brawl"), "B");
    assertEquals(defaultDamageType("melee"), "L");
    assertEquals(defaultDamageType("firearms"), "L");
    assertEquals(defaultDamageType("thrown"), "L");
    // Source: buildOpts uses (meta.damageType ?? "L") for melee and firearms.
    const meleeBlock = ATTACK_SRC.match(/case "melee":[\s\S]*?return\s*\{[\s\S]*?\};/);
    assert(meleeBlock && /damageType: \(meta\.damageType \?\? "L"\)/.test(meleeBlock[0]),
      "/melee must default damageType to L");
    const fireBlock = ATTACK_SRC.match(/case "firearms":[\s\S]*?return\s*\{[\s\S]*?\};/);
    assert(fireBlock && /damageType: \(meta\.damageType \?\? "L"\)/.test(fireBlock[0]),
      "/firearms must default damageType to L");
    // Default brawl path: caller passes no weapon -> "B".
    assert(
      /default:\s*return \{ abilityName: "Brawl", damageType: "B"/.test(ATTACK_SRC),
      "brawl default must keep damageType=B",
    );
  });

  // A-6: weapon damage feeds the damage pool, not the attack pool.
  it("A-6: weaponBonus adds to damage roll, not attack roll", () => {
    // Pure resolveAttack: with attackPool fully spent on a single net success,
    // weaponBonus must increase the damageRoll pool. Use fixed roller.
    // Attacker Dex(2+1=3) + Melee(2)=5 attack pool. Provide a roller that
    // forces 1 net success on attack and tracks damage pool.
    let damagePoolSeen = 0;
    const roller = (() => {
      let call = 0;
      return (pool: number, difficulty?: number): IDiceRoll => {
        call++;
        const d = difficulty ?? 6;
        if (call === 1) return evaluateRoll([8, 9, 2], d, false); // net=1, no botch
        if (call === 2) { damagePoolSeen = pool; return evaluateRoll([1], d, false); }
        return evaluateRoll([1], d, false);
      };
    })();
    const attacker = mkChar();
    const defender = mkChar();
    const r = resolveAttack(attacker, defender, {
      abilityName: "Melee", damageType: "L", weaponBonus: 3, noDefense: true, roller,
    });
    assert(r.damageRoll, "damage roll must be produced after net success");
    // Damage pool = Strength + weaponBonus + netSuccesses. With weaponBonus=3
    // and netSuccesses=1, run the same call with weaponBonus=0 and assert the
    // pool grew by exactly 3.
    const seenWith = damagePoolSeen;
    damagePoolSeen = 0;
    const rollerBaseline = (() => {
      let call = 0;
      return (pool: number, difficulty?: number): IDiceRoll => {
        call++;
        const d = difficulty ?? 6;
        if (call === 1) return evaluateRoll([8, 9, 2], d, false);
        if (call === 2) { damagePoolSeen = pool; return evaluateRoll([1], d, false); }
        return evaluateRoll([1], d, false);
      };
    })();
    resolveAttack(attacker, defender, {
      abilityName: "Melee", damageType: "L", weaponBonus: 0, noDefense: true, roller: rollerBaseline,
    });
    assertEquals(seenWith - damagePoolSeen, 3,
      "weaponBonus must add directly to the damage pool");
  });

  // A-7: silver flag does not change mechanic (regression guard).
  it("A-7: silver is narration-only; does not enter resolveAttack", () => {
    // Source: resolveAttack signature & IAttackOptions don't mention silver.
    const COMBAT_SRC = Deno.readTextFileSync(
      new URL("../core/combat.ts", import.meta.url),
    );
    assert(
      !/silver/i.test(COMBAT_SRC),
      "core/combat.ts must not reference silver (narration-only flag)",
    );
    // Command source: silver only feeds the silverPrefix narration string.
    assert(
      /silverPrefix/.test(ATTACK_SRC),
      "silver must be used for narration prefix",
    );
  });

  // A-8: self-attack rejected.
  it("A-8: self-attack rejected (regression guard)", () => {
    assert(
      /tgtObj\.id === u\.me\.id/.test(ATTACK_SRC),
      "command must compare target id to attacker id",
    );
    assert(
      /You cannot attack yourself/.test(ATTACK_SRC),
      "command must surface a clear refusal",
    );
  });

  // A-9: incapacitated attacker rejected (and likewise incapacitated target).
  it("A-9: incapacitated attacker is rejected", () => {
    assert(
      /isIncapacitated\(attackerChar\)/.test(ATTACK_SRC),
      "command must check isIncapacitated on attacker",
    );
    assert(
      /You are incapacitated and cannot act/.test(ATTACK_SRC),
      "command must surface the refusal",
    );
    // Symmetric: defender incapacitated also rejected.
    assert(
      /isIncapacitated\(defenderChar\)/.test(ATTACK_SRC),
      "command must short-circuit when defender already down",
    );
  });

  // Mechanic guard: claws weaponBonus = 1 (regression).
  it("buildOpts: /claws supplies +1 weapon die (regression guard)", () => {
    assert(
      /case "claws":[\s\S]*weaponBonus: 1/.test(ATTACK_SRC),
      "/claws must grant exactly +1 die",
    );
  });

  // Sanity: firearms damage roll uses fixed numbers under a deterministic roller.
  it("resolveAttack threads damage type to result", () => {
    const r = resolveAttack(mkChar(), mkChar(), {
      damageType: "L", weaponBonus: 0, noDefense: true, roller: fixed([8]),
    });
    assertEquals(r.damageType, "L");
  });
});
