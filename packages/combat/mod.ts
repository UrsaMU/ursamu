/**
 * @module @ursamu/combat
 *
 * System-agnostic combat engine for UrsaMU.
 *
 * Game systems (CofD, D&D, …) implement CombatPorts and register them
 * at plugin init. AI decisions come from CombatBrain modules (JSON
 * strategies by default; ai-gm or custom brains optional).
 */

// Types
export type {
  CoverState,
  Encounter,
  EncounterStatus,
  Participant,
  ReactionPosture,
  TerrainObject,
} from "./src/types.ts";
export { getCoverDurability } from "./src/types.ts";

// Ports
export type {
  CombatAction,
  CombatActionCtx,
  CombatActionResult,
  CombatActorView,
  CombatPorts,
} from "./src/ports.ts";
export {
  getCombatPorts,
  registerCombatPorts,
  requireCombatPorts,
  unregisterCombatPorts,
} from "./src/ports.ts";

// Config
export type { CombatConfig } from "./src/config.ts";
export {
  getCombatConfig,
  resetCombatConfig,
  setCombatConfig,
} from "./src/config.ts";

// Brains
export type {
  BrainCtx,
  CombatBrain,
  CombatDecideHookCtx,
} from "./src/brains.ts";
export {
  clearCombatBrains,
  decideAction,
  isLlmAiKey,
  isManualAiKey,
  jsonStrategyBrain,
  listCombatBrains,
  registerCombatBrain,
  setCombatDecideEmitter,
  unregisterCombatBrain,
} from "./src/brains.ts";

// gameHooks wire
export {
  isCombatDecideHookWired,
  unwireCombatDecideHook,
  wireCombatDecideHook,
} from "./src/hooks-wire.ts";

// Encounter store
export {
  addParticipant,
  advanceTurn,
  allNpcsDown,
  createEncounter,
  currentParticipant,
  encounterDb,
  getEncounter,
  getEncounterForRoom,
  patchParticipant,
  setEncounter,
} from "./src/encounter.ts";

// Encounter store (pluggable persistence)
export type { EncounterStore } from "./src/store.ts";
export {
  defaultEncounterStore,
  getEncounterStore,
  registerEncounterStore,
  unregisterEncounterStore,
} from "./src/store.ts";

// Walker
export type { WalkerOptions } from "./src/walker.ts";
export { advanceTurnSmart, smartNext } from "./src/walker.ts";

// AI
export {
  AI_STRATEGY_ERRORS,
  AI_STRATEGIES,
  aiStrategyKeys,
  evaluateStrategy,
  getAiStrategy,
  getArchetype,
  listAiStrategies,
  listArchetypes,
  makeEvalCtx,
  strategyAsFn,
} from "./src/ai/index.ts";
export type {
  AiDecision,
  AiStrategy,
  ArchetypeFn,
  EvalCtx,
} from "./src/ai/index.ts";

// Plugin
export { plugin, plugin as default } from "./index.ts";
