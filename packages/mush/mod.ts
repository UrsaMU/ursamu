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
export { buildContext }                      from "./src/world/context.ts";
export type { GameContext }                  from "./src/world/context.ts";
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
export { resetNoiseState, createNoise } from "./src/softcode/stdlib/noise.ts";
export { entries, lookup, register } from "./src/softcode/stdlib/registry.ts";
export type { StdlibFn }             from "./src/softcode/stdlib/registry.ts";
export { lookupSub, registerSub }    from "./src/softcode/stdlib/subRegistry.ts";
export { sandboxService, SandboxService, scopedUpdate }  from "./src/softcode/sandbox.ts";
export type { SandboxRpcHandler }                        from "./src/softcode/sandbox.ts";
export { SDKService }                                    from "./src/softcode/sdk-service.ts";
export type { SDKContext, SDKObject }                    from "./src/softcode/sdk-service.ts";

// Command API
export { addCmd, clearCmds, cmds, loadDefaultCommands, registerScript, getScript } from "./src/commands/addCmd.ts";
export { createNativeSDK }                   from "./src/commands/sdk.ts";
export type { ICmd, IUrsamuSDK, DbAccessor, OutputAccessor, FormatSlot } from "./src/commands/types.ts";

// Format pipeline
export {
  registerFormatHandler,
  unregisterFormatHandler,
  registerFormatTemplate,
  resolveFormat,
  resolveFormatOr,
  runPluginFormatHandlers,
  resolveGlobalFormat,
  resolveGlobalFormatOr,
  _clearFormatHandlers,
  center,
  ljust,
  rjust,
  header,
  divider,
  footer,
  registerHeader,
  registerDivider,
  registerFooter,
  unregisterHeader,
  unregisterDivider,
  unregisterFooter,
} from "./src/format/handlers.ts";
export type { FormatHandler, LayoutFn } from "./src/format/handlers.ts";

// Re-export GameHookMap augmentation so consumers get mush event types
export type { MushHookMap }                  from "./src/events/types.ts";
export { chargenHooks }                      from "./src/events/chargen.ts";
export type { IChargenApp, ChargenHookMap }  from "./src/events/chargen.ts";

// REST routes
export {
  authHandler, dbObjHandler, configHandler, sceneHandler,
  objectsHandler, flagsHandler, functionsHandler,
  registerMushRoutes, handleRequest as mushHandleRequest, setAuthenticator,
  avatarServe, MAX_API_TRACKED_IPS, authenticate,
} from "./src/routes/index.ts";
export { registerPluginRoute } from "./src/routes/plugin.ts";
export type { PluginRouteHandler } from "./src/routes/plugin.ts";
export { meHandler, onlinePlayersHandler, channelsHandler, channelHistoryHandler } from "./src/routes/players.ts";
export { MAX_TRACKED_IPS } from "./src/routes/auth.ts";

// Entrypoints
export { initializeEngine, mu, checkAndCreateSuperuser } from "./src/main.ts";
export { startTelnetServer } from "./src/telnet.ts";
export { handleRequest, registerUIComponent, unregisterUIComponent } from "./src/app.ts";
export type { IUIComponent } from "./src/app.ts";

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

// Event Hooks
export { hooks }                                                   from "./src/events/hooks.ts";

// Utilities
export { target, getAttribute, isNameTaken }                          from "./src/main_utils.ts";

// Backwards-compat shim — plugins that imported `wsService` before the monorepo split
import { sessions } from "@ursamu/core";
export const wsService: {
  getConnectedSockets(): Array<{ cid: string | undefined; id: string }>;
} = {
  getConnectedSockets(): Array<{ cid: string | undefined; id: string }> {
    return sessions.list().map((s) => ({
      id: s.socketId,
      cid: (((s as unknown as Record<string, unknown>).actorId as string | undefined) ?? (s.sessionId || undefined)),
    }));
  },
};

/**
 * PluginConfigManager — minimal stub exported for compatibility with
 * external plugins (e.g. ursamu-sgp-plugin) that import this class from
 * `@ursamu/ursamu`. The real implementation lives inside those plugins;
 * this stub satisfies the named-export requirement so Deno's module loader
 * does not abort on import.
 */
export class PluginConfigManager<T extends Record<string, unknown> = Record<string, unknown>> {
  private _data: Partial<T>;

  constructor(
    _pluginName: string,
    _defaults: Partial<T> = {},
    _configDir?: string,
  ) {
    this._data = { ..._defaults };
  }

  get<K extends keyof T>(key: K): T[K] | undefined {
    return this._data[key] as T[K] | undefined;
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this._data[key] = value;
  }

  getAll(): Partial<T> {
    return { ...this._data };
  }

  async load(): Promise<void> {
    // no-op stub — real persistence lives in the plugin
  }

  async save(): Promise<void> {
    // no-op stub — real persistence lives in the plugin
  }
}

