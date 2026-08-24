/**
 * Tests -- Ongoing Ammo Effects (engine/effects.ts)
 */
import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  enqueueAmmoEffect, tickAmmoEffects, extinguishBurn,
  smokeRoomEffect, effectLabel,
} from "../engine/effects.ts";
import { buildNewCharacter } from "../engine/character.ts";
import type { IAmmoEffectState, ICPRCharacter } from "../db/schemas.ts";

const charWith = (effects: IAmmoEffectState[]): ICPRCharacter => ({
  ...buildNewCharacter("solo"),
  activeAmmoEffects: effects,
});

describe("enqueueAmmoEffect()", () => {
  it("burn always applied with 1 damage/turn and indefinite duration", () => {
    const out = enqueueAmmoEffect([], { effect: "burn", duration: -1 });
    assertEquals(out.length, 1);
    assertEquals(out[0].effect, "burn");
    assertEquals(out[0].damagePerTurn, 1);
    assertEquals(out[0].remainingTurns, -1);
  });

  it("emp applied with 1d6 rounds, no damage", () => {
    const out = enqueueAmmoEffect([], { effect: "emp" });
    assertEquals(out.length, 1);
    assertEquals(out[0].damagePerTurn, 0);
    assert(out[0].remainingTurns >= 1 && out[0].remainingTurns <= 6);
  });

  it("poison: failed save (roll < DV) enqueues damage effect", () => {
    const out = enqueueAmmoEffect([], { effect: "poison", dv: 13 }, 5);
    assertEquals(out.length, 1);
    assertEquals(out[0].effect, "poison");
    assertEquals(out[0].remainingTurns, 3);
    assert((out[0].damagePerTurn ?? 0) >= 1);
    assertEquals(out[0].dvSavedAt, 5);
  });

  it("poison: passed save (roll >= DV) does NOT enqueue", () => {
    const out = enqueueAmmoEffect([], { effect: "poison", dv: 13 }, 20);
    assertEquals(out.length, 0);
  });

  it("biotoxin failed DV15 save enqueues 1d6/turn for 3 rounds", () => {
    const out = enqueueAmmoEffect([], { effect: "biotoxin", dv: 15 }, 4);
    assertEquals(out.length, 1);
    assertEquals(out[0].effect, "biotoxin");
    assertEquals(out[0].remainingTurns, 3);
  });

  it("sleep failed DV15 save enqueues 10-round sleep, no damage", () => {
    const out = enqueueAmmoEffect([], { effect: "sleep", dv: 15 }, 3);
    assertEquals(out.length, 1);
    assertEquals(out[0].effect, "sleep");
    assertEquals(out[0].remainingTurns, 10);
    assertEquals(out[0].damagePerTurn, 0);
  });

  it("stun is ignored (owned by stun-pool subsystem)", () => {
    const out = enqueueAmmoEffect([], { effect: "stun" });
    assertEquals(out.length, 0);
  });

  it("smoke is ignored on a character (use smokeRoomEffect)", () => {
    const out = enqueueAmmoEffect([], { effect: "smoke", duration: 6 });
    assertEquals(out.length, 0);
  });
});

describe("tickAmmoEffects()", () => {
  it("burn ticks 1 damage/turn and never expires until extinguished", () => {
    let char = charWith([{ effect: "burn", remainingTurns: -1, damagePerTurn: 1 }]);
    for (let i = 0; i < 5; i++) {
      const r = tickAmmoEffects(char);
      assertEquals(r.damage, 1);
      assertEquals(r.expired.length, 0);
      assertEquals(r.remaining.length, 1);
      assertEquals(r.remaining[0].remainingTurns, -1);
      char = { ...char, activeAmmoEffects: r.remaining };
    }
  });

  it("poison ticks 1d6/turn, expires after listed duration", () => {
    let char = charWith([{
      effect: "poison", remainingTurns: 3, damagePerTurn: 4,
    }]);
    let totalDmg = 0;
    for (let i = 0; i < 3; i++) {
      const r = tickAmmoEffects(char);
      totalDmg += r.damage;
      char = { ...char, activeAmmoEffects: r.remaining };
    }
    assertEquals(totalDmg, 12);
    assertEquals(char.activeAmmoEffects?.length, 0);
  });

  it("emp expires without damage", () => {
    let char = charWith([{ effect: "emp", remainingTurns: 2, damagePerTurn: 0 }]);
    let totalDmg = 0;
    let ticks = 0;
    while ((char.activeAmmoEffects?.length ?? 0) > 0 && ticks < 10) {
      const r = tickAmmoEffects(char);
      totalDmg += r.damage;
      char = { ...char, activeAmmoEffects: r.remaining };
      ticks++;
    }
    assertEquals(totalDmg, 0);
    assertEquals(ticks, 2);
  });

  it("expired effects are partitioned correctly", () => {
    const char = charWith([
      { effect: "poison", remainingTurns: 1, damagePerTurn: 3 },
      { effect: "burn",   remainingTurns: -1, damagePerTurn: 1 },
    ]);
    const r = tickAmmoEffects(char);
    assertEquals(r.damage, 4);
    assertEquals(r.expired.length, 1);
    assertEquals(r.expired[0].effect, "poison");
    assertEquals(r.remaining.length, 1);
    assertEquals(r.remaining[0].effect, "burn");
  });
});

describe("extinguishBurn()", () => {
  it("removes all burn entries, keeps others", () => {
    const out = extinguishBurn([
      { effect: "burn",   remainingTurns: -1, damagePerTurn: 1 },
      { effect: "poison", remainingTurns: 2,  damagePerTurn: 3 },
      { effect: "burn",   remainingTurns: -1, damagePerTurn: 1 },
    ]);
    assertEquals(out.length, 1);
    assertEquals(out[0].effect, "poison");
  });
});

describe("smokeRoomEffect()", () => {
  it("creates a room effect with -4 penalty and 6-round expiry", () => {
    const eff = smokeRoomEffect(3);
    assertEquals(eff.type, "smoke");
    assertEquals(eff.taskPenalty, -4);
    assertEquals(eff.expiresAtRound, 9);
  });
});

describe("effectLabel()", () => {
  it("returns a non-empty string for each effect kind", () => {
    const kinds: IAmmoEffectState["effect"][] =
      ["burn", "poison", "emp", "sleep", "biotoxin"];
    for (const k of kinds) {
      const s = effectLabel({ effect: k, remainingTurns: 1 });
      assert(s.length > 0);
    }
  });
});
