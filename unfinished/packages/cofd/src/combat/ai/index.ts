// Re-export combat AI + CofD legacy compat (selfActor → selfView).

export {
  AI_STRATEGY_ERRORS,
  AI_STRATEGIES,
  aiStrategyKeys,
  getAiStrategy,
  listAiStrategies,
  listArchetypes,
} from "@ursamu/combat";

export type {
  AiDecision,
  AiStrategy,
  ArchetypeFn,
  EvalCtx,
} from "@ursamu/combat";

export {
  actorToView,
  evaluateStrategy,
  getArchetype,
  healthFracFromActor,
  legacyToEvalCtx,
  strategyAsFn,
} from "./compat.ts";
export type { LegacyAiCtx } from "./compat.ts";
