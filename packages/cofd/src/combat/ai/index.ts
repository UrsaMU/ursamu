// NPC AI strategy registry.
//
// Strategies are JSON under resources/ai/*.json (see
// resources/schemas/ai-strategy.schema.json). The walker resolves
// sheet.npc.aiArchetype → strategy slug → evaluateStrategy().

import type { IDBObj } from "@ursamu/ursamu";
import type {
  Encounter,
  Participant,
  ReactionPosture,
} from "../types.ts";
import {
  AI_STRATEGY_ERRORS,
  AI_STRATEGIES,
  aiStrategyKeys,
  getAiStrategy,
  listAiStrategies,
} from "./strategy_catalog.ts";
import { evaluateStrategy, strategyAsFn } from "./evaluate.ts";
import type { AiStrategy } from "./strategy_types.ts";

export interface AiDecision {
  action: "attack" | "move" | "reload" | "flee" | "posture" | "wait";
  targetId?: string;
  posture?: ReactionPosture;
  reason: string;
}

export interface AiContext {
  self: Participant;
  enc: Encounter;
  selfActor: IDBObj;
  others: Participant[];
}

export type ArchetypeFn = (ctx: AiContext) => AiDecision;

export {
  AI_STRATEGY_ERRORS,
  AI_STRATEGIES,
  aiStrategyKeys,
  evaluateStrategy,
  getAiStrategy,
  listAiStrategies,
  strategyAsFn,
};
export type { AiStrategy };

/**
 * Resolve AI by strategy slug. Unknown → null (walker treats as manual).
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
