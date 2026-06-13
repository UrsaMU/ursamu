// Beshilu rat-host swarmer archetype.
// Behavior:
//   structure% < 25  -> flee
//   pack_mate_down   -> revenge attack the killer (highest threat)
//   gang_up          -> 2+ swarmers near a target -> pile on
//   weakest_nearby   -> attack lowest current health
//   else             -> attack any non-out target

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
  const remaining = Math.max(0, max - taken);
  if (self.isOut) return 0;
  return max > 0 ? Math.floor((remaining / max) * 100) : 100;
}

function currentHealth(p: Participant, ctx: Ctx): number {
  const actor = (ctx as unknown as { _actors?: Map<string, IDBObj> })._actors?.get(
    p.actorId,
  );
  if (!actor) return 100;
  return structurePct(p, actor);
}

export function beshiluSwarmer(ctx: Ctx): AiDecision {
  const pct = structurePct(ctx.self, ctx.selfActor);

  // 1. Flee if hurt below 25%.
  if (pct < 25) {
    return { action: "flee", reason: "structure < 25% -- flee" };
  }

  const liveEnemies = ctx.others.filter((p) => !p.isOut && p.kind !== "npc");

  // 2. Pack-mate revenge: any same-archetype participant is out -- target highest-threat actor.
  const packMates = ctx.others.filter((p) =>
    p.kind === "npc" && p.actorId !== ctx.self.actorId
  );
  const downPackMates = packMates.filter((p) => p.isOut);
  if (downPackMates.length > 0 && ctx.self.threat) {
    const entries = Object.entries(ctx.self.threat).sort((a, b) => b[1] - a[1]);
    for (const [aid] of entries) {
      const target = liveEnemies.find((p) => p.actorId === aid);
      if (target) {
        return {
          action: "attack",
          targetId: target.actorId,
          reason: "pack-mate down -- revenge attack",
        };
      }
    }
  }

  // 3. Gang-up: if any target has 2+ swarmers near (== same encounter, non-self, alive).
  const livingMates = packMates.filter((p) => !p.isOut);
  if (livingMates.length >= 1 && liveEnemies.length > 0) {
    // We're 1 of 2+ -- gang up on the first live enemy.
    return {
      action: "attack",
      targetId: liveEnemies[0].actorId,
      reason: `gang-up (${livingMates.length + 1} swarmers)`,
    };
  }

  // 4. Weakest-nearby: target lowest health.
  if (liveEnemies.length > 0) {
    let weakest = liveEnemies[0];
    let weakestPct = currentHealth(weakest, ctx);
    for (const e of liveEnemies.slice(1)) {
      const p = currentHealth(e, ctx);
      if (p < weakestPct) { weakest = e; weakestPct = p; }
    }
    return {
      action: "attack",
      targetId: weakest.actorId,
      reason: "weakest target",
    };
  }

  return { action: "wait", reason: "no targets" };
}
