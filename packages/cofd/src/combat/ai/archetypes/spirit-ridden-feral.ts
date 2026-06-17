// Spirit-ridden feral archetype (possessed mortal).
// Behavior:
//   aiState.frenzied -> attack threat-highest actor
//   damaged this round -> set frenzy, attack the attacker
//   else -> attack a random non-out target

import type { IDBObj } from "@ursamu/ursamu";
import type { Encounter, Participant } from "../../types.ts";
import type { AiDecision } from "../index.ts";

interface Ctx {
  self: Participant;
  enc: Encounter;
  selfActor: IDBObj;
  others: Participant[];
}

export function spiritRiddenFeral(ctx: Ctx): AiDecision {
  const state = (ctx.self.aiState ?? {}) as Record<string, unknown>;
  const frenzied = !!state.frenzied;
  const liveEnemies = ctx.others.filter((p) => !p.isOut && p.kind !== "npc");

  if (liveEnemies.length === 0) {
    return { action: "wait", reason: "no targets" };
  }

  // 1. Already frenzied -> threat-highest target.
  if (frenzied) {
    const threat = ctx.self.threat ?? {};
    const sorted = Object.entries(threat).sort((a, b) => b[1] - a[1]);
    for (const [aid] of sorted) {
      const t = liveEnemies.find((p) => p.actorId === aid);
      if (t) {
        return {
          action: "attack",
          targetId: t.actorId,
          reason: "frenzied -- highest-threat target",
        };
      }
    }
    // No threat memory but frenzied -- random.
    return {
      action: "attack",
      targetId: liveEnemies[0].actorId,
      reason: "frenzied -- target available",
    };
  }

  // 2. Damaged this round -> frenzy + attack the attacker.
  // Use damageThisTurn flag stored on aiState by the walker (engine sets it).
  const dmgThisRound = !!state.damagedThisRound;
  if (dmgThisRound) {
    const threat = ctx.self.threat ?? {};
    const sorted = Object.entries(threat).sort((a, b) => b[1] - a[1]);
    for (const [aid] of sorted) {
      const t = liveEnemies.find((p) => p.actorId === aid);
      if (t) {
        return {
          action: "attack",
          targetId: t.actorId,
          reason: "wounded -- frenzy on attacker",
        };
      }
    }
  }

  // 3. Has threat -> threat-highest target.
  const hasThreat = ctx.self.threat && Object.keys(ctx.self.threat).length > 0;
  if (hasThreat) {
    const threat = ctx.self.threat ?? {};
    const sorted = Object.entries(threat).sort((a, b) => b[1] - a[1]);
    for (const [aid] of sorted) {
      const t = liveEnemies.find((p) => p.actorId === aid);
      if (t) {
        return {
          action: "attack",
          targetId: t.actorId,
          reason: "threat -- highest-threat target",
        };
      }
    }
  }

  // 4. Random non-out target. Use first entry for determinism in tests.
  return {
    action: "attack",
    targetId: liveEnemies[0].actorId,
    reason: "random target",
  };
}
