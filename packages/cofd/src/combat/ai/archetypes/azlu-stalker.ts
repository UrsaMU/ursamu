// Azlu spider-host stalker archetype.
// Behavior:
//   !aiState.revealed && no_recent_damage -> ambush posture and wait
//   structure% < 50                       -> seek cover (or move)
//   target_isolated                        -> attack the lone target
//   else                                  -> attack closest live target

import type { IDBObj } from "@ursamu/ursamu";
import type { Encounter, Participant } from "../../types.ts";
import type { AiDecision } from "../index.ts";
import type { CofdSheet } from "../../../stats/index.ts";

interface Ctx {
  self: Participant;
  enc: Encounter;
  selfActor: IDBObj;
  others: Participant[];
}

function structurePct(self: Participant, actor: IDBObj): number {
  const sheet = actor.state?.cofd as CofdSheet | undefined;
  if (!sheet) return 100;
  const size = sheet.advantages?.size ?? 5;
  const stamina = sheet.attributes?.stamina ?? sheet.attributes?.Stamina ?? 1;
  const max = size + stamina;
  const h = sheet.health ?? { bashing: 0, lethal: 0, aggravated: 0 };
  const taken = (h.bashing ?? 0) + (h.lethal ?? 0) + (h.aggravated ?? 0);
  if (self.isOut) return 0;
  return max > 0 ? Math.floor((Math.max(0, max - taken) / max) * 100) : 100;
}

export function azluStalker(ctx: Ctx): AiDecision {
  const state = (ctx.self.aiState ?? {}) as Record<string, unknown>;
  const revealed = !!state.revealed;
  const damageThisRound = ctx.self.threat
    ? Object.values(ctx.self.threat).reduce((s, v) => s + v, 0)
    : 0;

  // 1. Unrevealed + no recent damage -> ambush.
  if (!revealed && damageThisRound === 0) {
    return {
      action: "posture",
      posture: { type: "ambush" },
      reason: "unrevealed -- set ambush",
    };
  }

  const pct = structurePct(ctx.self, ctx.selfActor);
  // 2. Wounded under 50% -> seek cover.
  if (pct < 50) {
    const terrain = ctx.enc.terrain ?? [];
    const cover = terrain.find(
      (t) => t.kind === "cover" && t.structure > 0,
    );
    if (cover) {
      return { action: "move", reason: `seek cover (${cover.name})` };
    }
    return { action: "move", reason: "seek cover -- no terrain known" };
  }

  const liveEnemies = ctx.others.filter((p) => !p.isOut && p.kind !== "npc");
  if (liveEnemies.length === 0) {
    return { action: "wait", reason: "no targets" };
  }

  // 3. Isolated target preferred.
  // An "ally" of a target is any other live enemy (proxy for adjacency in
  // pre-geometry Pass 2). A target is isolated when liveEnemies.length === 1.
  if (liveEnemies.length === 1) {
    return {
      action: "attack",
      targetId: liveEnemies[0].actorId,
      reason: "target isolated",
    };
  }

  // 4. Closest = first live target (no geometry yet).
  return {
    action: "attack",
    targetId: liveEnemies[0].actorId,
    reason: "closest target",
  };
}
