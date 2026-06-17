// NPC AI archetype registry.
//
// Each archetype is a pure function that, given the engine context, returns
// an AiDecision describing what the NPC wants to do this turn. The walker
// (advanceTurnSmart) is responsible for executing the decision against the
// live game state.

import type { IDBObj } from "@ursamu/ursamu";
import type { Encounter, Participant, ReactionPosture } from "../types.ts";
import { beshiluSwarmer } from "./archetypes/beshilu-swarmer.ts";
import { azluStalker } from "./archetypes/azlu-stalker.ts";
import { spiritRiddenFeral } from "./archetypes/spirit-ridden-feral.ts";

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

const ARCHETYPES: Record<string, ArchetypeFn> = {
  "beshilu-swarmer": beshiluSwarmer,
  "azlu-stalker": azluStalker,
  "spirit-ridden-feral": spiritRiddenFeral,
};

export function getArchetype(key: string): ArchetypeFn | null {
  if (!key) return null;
  return ARCHETYPES[key.toLowerCase().trim()] ?? null;
}

export function listArchetypes(): string[] {
  return Object.keys(ARCHETYPES);
}
