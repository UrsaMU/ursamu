/**
 * Bridge legacy CofD AI context (selfActor + CofdSheet) to
 * @ursamu/combat EvalCtx (selfView + healthFrac).
 */
import type { IDBObj } from "@ursamu/ursamu";
import type { CofdSheet } from "../../stats/index.ts";
import type {
  AiDecision,
  AiStrategy,
  CombatActorView,
  Encounter,
  EvalCtx,
  Participant,
} from "@ursamu/combat";
import {
  evaluateStrategy as coreEvaluate,
  getArchetype as coreGetArchetype,
  strategyAsFn as coreStrategyAsFn,
} from "@ursamu/combat";

/** Legacy walker / archetype context. */
export interface LegacyAiCtx {
  self: Participant;
  enc: Encounter;
  selfActor: IDBObj;
  others: Participant[];
  // deno-lint-ignore no-explicit-any
  _actors?: Map<string, IDBObj>;
}

export function healthFracFromActor(actor: IDBObj): number {
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

export function actorToView(
  actor: IDBObj,
  kind: "pc" | "npc" = "npc",
): CombatActorView {
  const sheet = actor.state?.cofd as
    | (CofdSheet & { npc?: { aiArchetype?: string } })
    | undefined;
  return {
    id: actor.id,
    name: actor.name ?? actor.id,
    kind,
    isOut: false,
    healthFrac: healthFracFromActor(actor),
    aiKey: sheet?.npc?.aiArchetype,
  };
}

export function legacyToEvalCtx(ctx: LegacyAiCtx): EvalCtx {
  const selfView = actorToView(ctx.selfActor, ctx.self.kind ?? "npc");
  const views = new Map<string, CombatActorView>();
  views.set(ctx.self.actorId, selfView);
  if (ctx._actors) {
    for (const [id, a] of ctx._actors) {
      const p = [ctx.self, ...ctx.others].find(
        (x) => x.actorId === id,
      );
      views.set(id, actorToView(a, p?.kind ?? "npc"));
    }
  }
  return {
    self: ctx.self,
    enc: ctx.enc,
    selfView,
    others: ctx.others,
    views,
  };
}

export function evaluateStrategy(
  strategy: AiStrategy,
  ctx: LegacyAiCtx | EvalCtx,
  rng?: () => number,
): AiDecision {
  const evalCtx = "selfActor" in ctx
    ? legacyToEvalCtx(ctx as LegacyAiCtx)
    : ctx as EvalCtx;
  return coreEvaluate(strategy, evalCtx, rng);
}

export function getArchetype(
  key: string,
): ((ctx: LegacyAiCtx | EvalCtx) => AiDecision) | null {
  const fn = coreGetArchetype(key);
  if (!fn) return null;
  return (ctx) => {
    const evalCtx = "selfActor" in (ctx as LegacyAiCtx)
      ? legacyToEvalCtx(ctx as LegacyAiCtx)
      : ctx as EvalCtx;
    return fn(evalCtx);
  };
}

export function strategyAsFn(
  strategy: AiStrategy,
  rng?: () => number,
): (ctx: LegacyAiCtx | EvalCtx) => AiDecision {
  const inner = coreStrategyAsFn(strategy, rng);
  return (ctx) => {
    const evalCtx = "selfActor" in (ctx as LegacyAiCtx)
      ? legacyToEvalCtx(ctx as LegacyAiCtx)
      : ctx as EvalCtx;
    return inner(evalCtx);
  };
}
