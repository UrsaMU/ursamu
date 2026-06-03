/**
 * @module @ursamu/mush
 *
 * MUSH world layer built on @ursamu/core.
 *
 * Provides: IDBObj world model, flag/lock system, TinyMUX softcode engine,
 * addCmd/IUrsamuSDK command API, format pipeline, and essential MUSH verbs.
 *
 * Re-exports everything from @ursamu/core so game code only needs one import.
 */

export * from "@ursamu/core";

// World model
export type { IDBObj, IDBOBJ, IAttribute, IGameTime } from "./src/world/types.ts";
export { dbojs, counters, chans, texts, scenes, chanHistory, Obj } from "./src/world/dbobjs.ts";
export { flags }                             from "./src/world/flags.ts";
export { evaluateLock, validateLock, registerLockFunc, registerLockEvaluator, callLockFunc } from "./src/world/locks.ts";
export type { LockFunc } from "./src/world/locks.ts";
export { hydrate }                           from "./src/world/dbobjs.ts";
export { gameClock }                         from "./src/world/game-clock.ts";
export { InterceptorService }                from "./src/world/interceptor-service.ts";
export { intentRegistry }                   from "./src/world/intent-registry.ts";
export { findCaretMatches, fireCaretPatterns, registerCaretExecutor } from "./src/world/caret-patterns.ts";
export type { CaretMatch } from "./src/world/caret-patterns.ts";
export { findDollarPattern, matchGlob }      from "./src/world/dollar-patterns.ts";
export type { Intent, InterceptorCandidate } from "./src/world/interceptor-service.ts";
export type {
  SayEvent, PoseEvent, PageEvent, MoveEvent, SessionEvent,
  ChannelMessageEvent, ObjectEvent, ObjectMovedEvent,
  ObjectCreatedEvent, ObjectDestroyedEvent, ObjectModifiedEvent,
  SceneCreatedEvent, ScenePoseEvent, SceneSetEvent, SceneTitleEvent,
  SceneClearEvent, MailReceivedEvent,
} from "./src/events/types.ts";

// Softcode
export { softcodeEngine, runSoftcode, runSoftcodeSimple } from "./src/softcode/engine.ts";
export { resetNoiseState } from "./src/softcode/stdlib/noise.ts";
export { sandboxService, SandboxService, scopedUpdate }  from "./src/softcode/sandbox.ts";
export type { SandboxRpcHandler }                        from "./src/softcode/sandbox.ts";
export { SDKService }                                    from "./src/softcode/sdk-service.ts";
export type { SDKContext, SDKObject }                    from "./src/softcode/sdk-service.ts";

// Command API
export { addCmd, cmds, loadDefaultCommands, registerScript } from "./src/commands/addCmd.ts";
export { createNativeSDK }                   from "./src/commands/sdk.ts";
export type { ICmd, IUrsamuSDK, DbAccessor, OutputAccessor, FormatSlot } from "./src/commands/types.ts";

// Format pipeline
export {
  registerFormatHandler,
  unregisterFormatHandler,
  registerFormatTemplate,
  resolveFormat,
  resolveGlobalFormat,
  _clearFormatHandlers,
} from "./src/format/handlers.ts";
export type { FormatHandler } from "./src/format/handlers.ts";

// Re-export GameHookMap augmentation so consumers get mush event types
export type { MushHookMap }                  from "./src/events/types.ts";
