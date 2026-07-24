// Evaluate a declarative AiStrategy against combat context.
// Matching rules: highest priority wins; same priority → weighted random.

import type {
  Encounter,
  Participant,
  ReactionPosture,
} from "../types.ts";
import type { CombatActorView } from "../ports.ts";
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
  selfView: CombatActorView;
  others: Participant[];
  /** Optional map for weakest-target / multi-actor health. */
  views?: Map<string, CombatActorView>;
}

function structureFraction(
  p: Participant,
  view: CombatActorView | undefined,
): number {
  if (p.isOut) return 0;
  if (view) {
    return Math.max(0, Math.min(1, view.healthFrac));
  }
  return 1;
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

function matchCondition(when: AiCondition, ctx: EvalCtx): boolean {
  const state = (ctx.self.aiState ?? {}) as Record<
    string,
    unknown
  >;
  const enemies = liveEnemies(ctx);
  const selfFrac = structureFraction(ctx.self, ctx.selfView);
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

  const tags = new Set(
    (ctx.selfView.tags ?? []).map((t) => t.toLowerCase()),
  );
  if (when.hasTags?.length) {
    for (const t of when.hasTags) {
      if (!tags.has(t.toLowerCase())) return false;
    }
  }
  if (when.missingTags?.length) {
    for (const t of when.missingTags) {
      if (tags.has(t.toLowerCase())) return false;
    }
  }

  const res = ctx.selfView.resources ?? {};
  if (when.resourceAtLeast) {
    for (const [k, min] of Object.entries(when.resourceAtLeast)) {
      if ((res[k] ?? 0) < min) return false;
    }
  }
  if (when.resourceAtMost) {
    for (const [k, max] of Object.entries(when.resourceAtMost)) {
      if ((res[k] ?? 0) > max) return false;
    }
  }

  if (when.sideIs !== undefined) {
    const side = (
      ctx.selfView.side ?? ctx.self.side ?? ""
    ).toLowerCase();
    if (side !== when.sideIs.toLowerCase()) return false;
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
    const views = ctx.views ?? new Map();
    let best = enemies[0];
    let bestFrac = structureFraction(
      best,
      views.get(best.actorId),
    );
    for (const e of enemies.slice(1)) {
      const f = structureFraction(e, views.get(e.actorId));
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
  const mode = spec.mode;

  if (spec.action === "attack") {
    const targetId = pickTarget(spec.target, enemies, ctx, rng);
    return { action: "attack", targetId, reason, mode };
  }
  if (spec.action === "posture") {
    const posture: ReactionPosture = {
      type: (spec.posture ?? "guard") as ReactionPosture["type"],
    };
    return { action: "posture", posture, reason, mode };
  }
  if (spec.action === "flee") {
    return { action: "flee", reason, mode };
  }
  if (spec.action === "move") {
    return { action: "move", reason, mode };
  }
  if (spec.action === "reload") {
    return { action: "reload", reason, mode };
  }
  if (spec.action === "defend") {
    return { action: "defend", reason, mode };
  }
  if (spec.action === "aim") {
    const targetId = pickTarget(spec.target, enemies, ctx, rng);
    return { action: "aim", targetId, reason, mode };
  }
  if (spec.action === "use") {
    return { action: "use", reason, mode };
  }
  return { action: "wait", reason, mode };
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
    return actionToDecision(fb, ctx, "fallback", rng);
  }
  const maxP = Math.max(...matched.map((r) => r.priority));
  const band = matched.filter((r) => r.priority === maxP);
  const chosen = pickWeighted(band, rng);
  const reason = chosen.reason ?? chosen.id;
  return actionToDecision(chosen.then, ctx, reason, rng);
}

/** Bind a strategy into an ArchetypeFn. */
export function strategyAsFn(
  strategy: AiStrategy,
  rng: () => number = Math.random,
): (ctx: EvalCtx) => AiDecision {
  return (ctx) => evaluateStrategy(strategy, ctx, rng);
}
