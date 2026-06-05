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
export { dbojs, counters, chans, texts, scenes, chanHistory, Obj, createObj, userFuncs, serverTags, playerTags, zoneMemberships } from "./src/world/dbobjs.ts";
export { flags }                             from "./src/world/flags.ts";
export { evaluateLock, validateLock, registerLockFunc, registerLockEvaluator, callLockFunc } from "./src/world/locks.ts";
export type { LockFunc } from "./src/world/locks.ts";
export { hydrate }                           from "./src/world/dbobjs.ts";
export { gameClock }                         from "./src/world/game-clock.ts";
export { InterceptorService }                from "./src/world/interceptor-service.ts";
export { intentRegistry }                   from "./src/world/intent-registry.ts";
export type { IntentDefinition, IntentRegistry } from "./src/world/intent-registry.ts";
export { findCaretMatches, fireCaretPatterns, registerCaretExecutor } from "./src/world/caret-patterns.ts";
export type { CaretMatch } from "./src/world/caret-patterns.ts";
export { findDollarPattern, matchGlob }      from "./src/world/dollar-patterns.ts";
export type { DollarMatch }                  from "./src/world/dollar-patterns.ts";
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
export { isTooDeep, isTimedOut, toLibCtx, makeSubCtx, snapshotRegisters, restoreRegisters } from "./src/softcode/context.ts";
export type { UrsaEvalContext, EvalContext as SoftcodeEvalContext } from "./src/softcode/context.ts";
export type {
  DbAccessor as SoftcodeDbAccessor,
  OutputAccessor as SoftcodeOutputAccessor,
} from "./src/softcode/context.ts";
export { resetNoiseState } from "./src/softcode/stdlib/noise.ts";
export { entries, lookup, register } from "./src/softcode/stdlib/registry.ts";
export type { StdlibFn }             from "./src/softcode/stdlib/registry.ts";
export { lookupSub, registerSub }    from "./src/softcode/stdlib/subRegistry.ts";
export { sandboxService, SandboxService, scopedUpdate }  from "./src/softcode/sandbox.ts";
export type { SandboxRpcHandler }                        from "./src/softcode/sandbox.ts";
export { SDKService }                                    from "./src/softcode/sdk-service.ts";
export type { SDKContext, SDKObject }                    from "./src/softcode/sdk-service.ts";

// Command API
export { addCmd, cmds, loadDefaultCommands, registerScript, getScript } from "./src/commands/addCmd.ts";
export { createNativeSDK }                   from "./src/commands/sdk.ts";
export type { ICmd, IUrsamuSDK, DbAccessor, OutputAccessor, FormatSlot } from "./src/commands/types.ts";

// Format pipeline
export {
  registerFormatHandler,
  unregisterFormatHandler,
  registerFormatTemplate,
  resolveFormat,
  resolveGlobalFormat,
  resolveGlobalFormatOr,
  _clearFormatHandlers,
} from "./src/format/handlers.ts";
export type { FormatHandler } from "./src/format/handlers.ts";

// Re-export GameHookMap augmentation so consumers get mush event types
export type { MushHookMap }                  from "./src/events/types.ts";
export { chargenHooks }                      from "./src/events/chargen.ts";
export type { IChargenApp, ChargenHookMap }  from "./src/events/chargen.ts";

// REST routes
export {
  authHandler, dbObjHandler, configHandler, sceneHandler,
  objectsHandler, flagsHandler, functionsHandler,
  registerMushRoutes, handleRequest, setAuthenticator,
  avatarServe, MAX_API_TRACKED_IPS,
} from "./src/routes/index.ts";
export { registerPluginRoute } from "./src/routes/plugin.ts";
export type { PluginRouteHandler } from "./src/routes/plugin.ts";
export { meHandler, onlinePlayersHandler, channelsHandler, channelHistoryHandler } from "./src/routes/players.ts";
export { MAX_TRACKED_IPS } from "./src/routes/auth.ts";

// Verbs barrel — all registered commands (loaded by loadDefaultCommands)
export { setLoadedPlugins }                  from "./src/verbs/admin-reload.ts";
export { runStartupAttrs }                   from "./src/world/startup.ts";

// Verb exec functions (re-exported for tests and bridge files)
export { execGet, execDrop, execGive, execUse, execCreateObject } from "./src/verbs/manipulation.ts";
export { execLook, defaultConformatHandler }                       from "./src/verbs/look.ts";
export { execHome, execInventory }                                 from "./src/verbs/home.ts";
export { execSay, execPose, execThink, execPage, execWhisper }     from "./src/verbs/say.ts";
export { execWho, execScore, execDoing, execPoll, execAway, execLast } from "./src/verbs/social.ts";
export { execEmit, execLemit, execPemit, execRemit, execWall, execCemit, execFsay } from "./src/verbs/emit-exec.ts";
// Channel exec functions now in @ursamu/channels
export type { } from "./src/verbs/channels-exec.ts"; // keep file resolvable for bridge imports
export { execBoot, execToad, execNewpassword, execChown, execResetToken, execSite, execShutdown } from "./src/verbs/admin.ts";
export { execReload, execNuke }                                    from "./src/verbs/admin-reload.ts";
export { execAlias }                                               from "./src/verbs/alias.ts";
export { execConnect, execQuit, execMotd, execPassword, execUpdate } from "./src/verbs/auth.ts";
export { execPs }                                                  from "./src/verbs/queue-ps.ts";
export { execTeleport, execTel, execEntrances, execForce, privLevel, REACTIVE_ATTRS } from "./src/verbs/world.ts";
export { execSweep }                                               from "./src/verbs/world-sweep.ts";
export { execFind, execFlags }                                     from "./src/verbs/world-find.ts";
export { execStats, execTime }                                     from "./src/verbs/world-info.ts";
export { execJs }                                                  from "./src/verbs/js-eval.ts";
export { execAvatar, isPrivateHost }                               from "./src/verbs/avatar.ts";
export { execReboot }                                              from "./src/verbs/admin-reload.ts";
export { execMoniker }                                             from "./src/verbs/moniker.ts";

// Render utilities
export { default as parser, resetJsCallCount, updateParserSubs }   from "./src/render/parser.ts";
export { Presenter }                                               from "./src/render/presenter.ts";
export type { IState as IRenderState }                             from "./src/render/types.ts";
