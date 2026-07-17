// Evaluate a declarative AiStrategy against combat context.
// Matching rules: highest priority wins; same priority → weighted random.

import type { IDBObj } from "@ursamu/ursamu";
import type { CofdSheet } from "../../stats/index.ts";
import type {
  Encounter,
  Participant,
  ReactionPosture,
} from "../types.ts";
import type { AiDecision } from "./index.ts";
import type {
  AiActionSpec,
  AiCondition,
  AiRule,
  AiStrategy,
  AiTargetPick,
} from "./strategy_types.ts";

export interface EvalCtx {
  self: Participant;
  enc: Encounter;
  selfActor: IDBObj;
  others: Participant[];
}

function structureFraction(
  p: Participant,
  actor: IDBObj | undefined,
): number {
  if (!actor || p.isOut) return 0;
  const sheet = actor.state?.cofd as CofdSheet | undefined;
  if (!sheet) return 1;
  const size = sheet.advantages?.size ?? 5;
  const stamina =
    sheet.attributes?.stamina ??
    // deno-lint-ignore no-explicit-any
    (sheet.attributes as any)?.Stamina ??
    1;
  const max = size + stamina;
  const h = sheet.health ?? {
    bashing: 0,
    lethal: 0,
    aggravated: 0,
  };
  const taken =
    (h.bashing ?? 0) + (h.lethal ?? 0) + (h.aggravated ?? 0);
  if (max <= 0) return 1;
  return Math.max(0, Math.min(1, (max - taken) / max));
}

function liveEnemies(ctx: EvalCtx): Participant[] {
  return ctx.others.filter((p) => !p.isOut && p.kind !== "npc");
}

function livingPackMates(ctx: EvalCtx): Participant[] {
  return ctx.others.filter(
    (p) =>
      p.kind === "npc" &&
      p.actorId !== ctx.self.actorId &&
      !p.isOut,
  );
}

function packMatesDown(ctx: EvalCtx): boolean {
  return ctx.others.some(
    (p) =>
      p.kind === "npc" &&
      p.actorId !== ctx.self.actorId &&
      p.isOut,
  );
}

function threatSum(self: Participant): number {
  if (!self.threat) return 0;
  return Object.values(self.threat).reduce((s, v) => s + v, 0);
}

function hasCover(enc: Encounter): boolean {
  const terrain = enc.terrain ?? [];
  return terrain.some(
    (t) => t.kind === "cover" && t.structure > 0,
  );
}

function actorMap(ctx: EvalCtx): Map<string, IDBObj> {
  // Optional test hook used by legacy archetypes.
  // deno-lint-ignore no-explicit-any
  const m = (ctx as any)._actors as Map<string, IDBObj> | undefined;
  return m ?? new Map();
}

function matchCondition(
  when: AiCondition,
  ctx: EvalCtx,
): boolean {
  const state = (ctx.self.aiState ?? {}) as Record<
    string,
    unknown
  >;
  const enemies = liveEnemies(ctx);
  const selfFrac = structureFraction(ctx.self, ctx.selfActor);
  const threat = !!ctx.self.threat &&
    Object.keys(ctx.self.threat).length > 0;

  if (when.selfHealthBelow !== undefined) {
    if (!(selfFrac < when.selfHealthBelow)) return false;
  }
  if (when.selfHealthAtMost !== undefined) {
    if (!(selfFrac <= when.selfHealthAtMost)) return false;
  }
  if (when.selfHealthAbove !== undefined) {
    if (!(selfFrac > when.selfHealthAbove)) return false;
  }
  if (when.selfHealthAtLeast !== undefined) {
    if (!(selfFrac >= when.selfHealthAtLeast)) return false;
  }
  if (when.unrevealed !== undefined) {
    if (!!state.revealed === when.unrevealed) return false;
  }
  if (when.revealed !== undefined) {
    if (!!state.revealed !== when.revealed) return false;
  }
  if (when.frenzied !== undefined) {
    if (!!state.frenzied !== when.frenzied) return false;
  }
  if (when.damagedThisRound !== undefined) {
    if (!!state.damagedThisRound !== when.damagedThisRound) {
      return false;
    }
  }
  if (when.noRecentDamage !== undefined) {
    const none = threatSum(ctx.self) === 0;
    if (none !== when.noRecentDamage) return false;
  }
  if (when.hasThreat !== undefined) {
    if (threat !== when.hasThreat) return false;
  }
  if (when.packMateDown !== undefined) {
    if (packMatesDown(ctx) !== when.packMateDown) return false;
  }
  if (when.livingPackMatesAtLeast !== undefined) {
    if (
      livingPackMates(ctx).length < when.livingPackMatesAtLeast
    ) {
      return false;
    }
  }
  if (when.enemyCountAtLeast !== undefined) {
    if (enemies.length < when.enemyCountAtLeast) return false;
  }
  if (when.enemyCountAtMost !== undefined) {
    if (enemies.length > when.enemyCountAtMost) return false;
  }
  if (when.enemyCountEquals !== undefined) {
    if (enemies.length !== when.enemyCountEquals) return false;
  }
  if (when.hasEnemies !== undefined) {
    if ((enemies.length > 0) !== when.hasEnemies) return false;
  }
  if (when.hasCover !== undefined) {
    if (hasCover(ctx.enc) !== when.hasCover) return false;
  }
  return true;
}

function pickWeighted(
  rules: AiRule[],
  rng: () => number,
): AiRule {
  if (rules.length === 1) return rules[0];
  const weights = rules.map((r) =>
    typeof r.weight === "number" && r.weight > 0 ? r.weight : 1
  );
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < rules.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return rules[i];
  }
  return rules[rules.length - 1];
}

function pickTarget(
  pick: AiTargetPick | undefined,
  enemies: Participant[],
  ctx: EvalCtx,
  rng: () => number,
): string | undefined {
  if (enemies.length === 0) return undefined;
  const mode = pick ?? "first";

  if (mode === "first" || mode === "isolated") {
    return enemies[0].actorId;
  }
  if (mode === "random") {
    const i = Math.floor(rng() * enemies.length);
    return enemies[Math.min(i, enemies.length - 1)].actorId;
  }
  if (mode === "highest-threat") {
    const threat = ctx.self.threat ?? {};
    const sorted = Object.entries(threat).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [aid] of sorted) {
      const t = enemies.find((p) => p.actorId === aid);
      if (t) return t.actorId;
    }
    return enemies[0].actorId;
  }
  if (mode === "weakest") {
    const actors = actorMap(ctx);
    let best = enemies[0];
    let bestFrac = structureFraction(
      best,
      actors.get(best.actorId),
    );
    for (const e of enemies.slice(1)) {
      const f = structureFraction(e, actors.get(e.actorId));
      if (f < bestFrac) {
        best = e;
        bestFrac = f;
      }
    }
    return best.actorId;
  }
  return enemies[0].actorId;
}

function actionToDecision(
  spec: AiActionSpec,
  ctx: EvalCtx,
  reason: string,
  rng: () => number,
): AiDecision {
  const enemies = liveEnemies(ctx);

  if (spec.action === "attack") {
    const targetId = pickTarget(spec.target, enemies, ctx, rng);
    return {
      action: "attack",
      targetId,
      reason,
    };
  }
  if (spec.action === "posture") {
    const posture: ReactionPosture = {
      type: (spec.posture ?? "guard") as ReactionPosture["type"],
    };
    return { action: "posture", posture, reason };
  }
  if (spec.action === "flee") {
    return { action: "flee", reason };
  }
  if (spec.action === "move") {
    return { action: "move", reason };
  }
  if (spec.action === "reload") {
    return { action: "reload", reason };
  }
  return { action: "wait", reason };
}

/**
 * Evaluate strategy rules for this turn.
 * 1. Collect rules whose `when` matches.
 * 2. Keep only the highest priority band.
 * 3. Weighted-random among that band (weight defaults to 1).
 * 4. Else fallback (default wait).
 */
export function evaluateStrategy(
  strategy: AiStrategy,
  ctx: EvalCtx,
  rng: () => number = Math.random,
): AiDecision {
  const matched = strategy.rules.filter((r) =>
    matchCondition(r.when ?? {}, ctx)
  );
  if (matched.length === 0) {
    const fb = strategy.fallback ?? { action: "wait" as const };
    return actionToDecision(
      fb,
      ctx,
      "fallback",
      rng,
    );
  }
  const maxP = Math.max(...matched.map((r) => r.priority));
  const band = matched.filter((r) => r.priority === maxP);
  const chosen = pickWeighted(band, rng);
  const reason = chosen.reason ?? chosen.id;
  return actionToDecision(chosen.then, ctx, reason, rng);
}

/** Bind a strategy into an ArchetypeFn for the walker registry. */
export function strategyAsFn(
  strategy: AiStrategy,
  rng: () => number = Math.random,
): (ctx: EvalCtx) => AiDecision {
  return (ctx) => evaluateStrategy(strategy, ctx, rng);
}
