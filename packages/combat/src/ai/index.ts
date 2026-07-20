// NPC AI strategy registry (JSON under resources/ai/*.json).

import type { Encounter, Participant } from "../types.ts";
import type { CombatActorView } from "../ports.ts";
import {
  AI_STRATEGY_ERRORS,
  AI_STRATEGIES,
  aiStrategyKeys,
  getAiStrategy,
  listAiStrategies,
} from "./strategy_catalog.ts";
import { evaluateStrategy, strategyAsFn } from "./evaluate.ts";
import type { EvalCtx } from "./evaluate.ts";
import type { AiStrategy } from "./strategy_types.ts";
import type { ReactionPosture } from "../types.ts";

export interface AiDecision {
  action: "attack" | "move" | "reload" | "flee" | "posture" | "wait";
  targetId?: string;
  posture?: ReactionPosture;
  reason: string;
}

export type ArchetypeFn = (ctx: EvalCtx) => AiDecision;

export {
  AI_STRATEGY_ERRORS,
  AI_STRATEGIES,
  aiStrategyKeys,
  evaluateStrategy,
  getAiStrategy,
  listAiStrategies,
  strategyAsFn,
};
export type { AiStrategy, EvalCtx };

/**
 * Resolve AI by strategy slug. Unknown → null (manual / next brain).
 */
export function getArchetype(key: string): ArchetypeFn | null {
  if (!key) return null;
  const k = key.toLowerCase().trim();
  if (k === "manual" || k === "off" || k === "none") return null;
  const strategy = getAiStrategy(k);
  if (!strategy) return null;
  return strategyAsFn(strategy);
}

export function listArchetypes(): string[] {
  return aiStrategyKeys();
}

/** Helper to build EvalCtx from walker state. */
export function makeEvalCtx(
  self: Participant,
  enc: Encounter,
  selfView: CombatActorView,
  others: Participant[],
  views?: Map<string, CombatActorView>,
): EvalCtx {
  return { self, enc, selfView, others, views };
}
