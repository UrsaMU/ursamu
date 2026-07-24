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
  CombatMeta,
  CoverState,
  Encounter,
  EncounterStatus,
  Participant,
  ReactionPosture,
  TerrainObject,
} from "./src/types.ts";
export {
  appendEncounterLog,
  DEFAULT_ENCOUNTER_LOG_CAP,
  getCoverDurability,
  mergeMeta,
} from "./src/types.ts";

// Ports
export type {
  CombatAction,
  CombatActionBase,
  CombatActionCtx,
  CombatActionResult,
  CombatActorView,
  CombatPorts,
} from "./src/ports.ts";
export {
  actionNeedsTarget,
  actionTargetId,
  getCombatPorts,
  registerCombatPorts,
  requireCombatPorts,
  unregisterCombatPorts,
} from "./src/ports.ts";

// Action result application (walker + hosts)
export type { ApplyResultOptions } from "./src/action-result.ts";
export { applyActionResult } from "./src/action-result.ts";

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
  actionMatchesLegal,
  clearCombatBrains,
  constrainToLegalActions,
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

// Initiative (engine sort/activate; formula via ports)
export type {
  ActivateOptions,
  JoinActiveOptions,
} from "./src/initiative.ts";
export {
  activateEncounter,
  joinActiveEncounter,
  rollAllInitiatives,
  sortByInitiative,
} from "./src/initiative.ts";

// Lifecycle (create / join / leave / begin / end / next)
export type {
  BeginOptions,
  JoinParticipant,
  LifecycleOptions,
} from "./src/lifecycle.ts";
export {
  beginEncounter,
  endEncounter,
  findRoomEncounter,
  joinEncounter,
  leaveEncounter,
  nextTurn,
  startEncounter,
} from "./src/lifecycle.ts";

// Turn UX helpers (startOrJoin / passTurn / endFight)
export type {
  EndFightOptions,
  PassTurnError,
  PassTurnOptions,
  PassTurnResult,
  StartOrJoinOptions,
  StartOrJoinResult,
  TurnHelperOptions,
} from "./src/turn-helpers.ts";
export {
  currentActor,
  endFight,
  formatInitiativeLines,
  passTurn,
  startOrJoin,
} from "./src/turn-helpers.ts";

// Adapter smoke kit (for game-system tests)
export type {
  AdapterKitActor,
  AdapterKitHooks,
  AdapterSmokeOptions,
  AdapterSmokeResult,
} from "./src/adapter-kit.ts";
export {
  memoryEncounterStore,
  runAdapterSmoke,
} from "./src/adapter-kit.ts";

// Walker
export type { WalkerOptions } from "./src/walker.ts";
export {
  advanceTurnSmart,
  runCombatAction,
  smartNext,
} from "./src/walker.ts";

// Pathfind (zone wander / hunter hop)
export type { PathfindOptions } from "./src/pathfind.ts";
export {
  getDefaultAdjacency,
  nextHopToward,
  setDefaultAdjacency,
} from "./src/pathfind.ts";

// Zone loop timers (host supplies tick body)
export {
  listZoneLoops,
  startZoneLoop,
  stopAllZoneLoops,
  stopZoneLoop,
} from "./src/zone-loop.ts";

// Encounter-aware room queries for wander / aggro
export type {
  ActiveEncounterHit,
  ZoneQueryOptions,
} from "./src/zone-query.ts";
export {
  findActiveEncounterRoom,
  roomHasActiveEncounter,
} from "./src/zone-query.ts";

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
