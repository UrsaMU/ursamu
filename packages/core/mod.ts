/**
 * @module @ursamu/core
 *
 * Generic multiplayer text-server infrastructure.
 * No MUSH, no world model, no softcode — just the engine.
 *
 * Layers above this (e.g. @ursamu/mush) supply the game-specific concepts.
 */

// Server / transports
export { createServer }                    from "./src/server/index.ts";
export { websocketTransport, closeSocket, listSocketIds, isRateLimitedForAuth, clampTermWidth, handleWebSocketConnection, sendPayload } from "./src/server/websocket.ts";
export { telnetTransport, parseNawsBytes, stripIacBytes, accumulateNaws, IAC, WILL, DO, DONT, WONT, SB, SE, NAWS_OPTION } from "./src/server/telnet.ts";
export {
  httpTransport,
  registerRoute,
  registerFallback,
  formatRemoteAddr,
  shouldSkipSecurityRewrap,
} from "./src/server/http.ts";
export type { ICoreServer, ITransport }    from "./src/server/types.ts";

// Input dispatch
export { addHandler, removeHandler }       from "./src/dispatch/handler.ts";
export {
  addMiddleware,
  removeMiddleware,
  clearMiddleware,
  getMiddleware,
} from "./src/dispatch/middleware.ts";
export { runPipeline }                     from "./src/dispatch/pipeline.ts";
export type { ICoreHandler, ICoreContext, IMiddlewareFn } from "./src/dispatch/types.ts";

// Plugin system
export {
  registerPlugin,
  loadPlugins,
  unloadPlugin,
  listPlugins,
  getPlugin,
  forceLoadPlugins,
  initializePlugins,
} from "./src/plugins/loader.ts";
export type { IPlugin, IPluginDep }        from "./src/plugins/types.ts";

// Event bus
export { gameHooks }                       from "./src/events/hooks.ts";
export type { CoreHookMap }                from "./src/events/types.ts";

// Database
export { DBO }                             from "./src/database/dbo.ts";
export type { Query }                      from "./src/database/types.ts";
export {
  DEFAULT_TYPEGRAPH_DB,
  DEFAULT_DENOKV_DB,
  absolutizeDbPath,
  pickTypegraphDbRaw,
  resolveTypegraphDbPath,
  resolveDenokvDbPath,
  ensureTypegraphDataDir,
} from "./src/database/path.ts";

// Session
export { sessions }                        from "./src/session/store.ts";
export { createToken, verifyToken }        from "./src/session/jwt.ts";
export type { ISession }                   from "./src/session/types.ts";

// Broadcast
export {
  send,
  broadcastAll,
  notify,
  registerSender,
  trackSocket,
  untrackSocket,
  trackedSockets,
  setFormatter,
  wordWrap,
  shouldWordWrap,
} from "./src/broadcast/send.ts";
export { rooms }                           from "./src/broadcast/rooms.ts";

// Queue
export { queue, registerExecutor }         from "./src/queue/index.ts";
export type { IQueueEntry, ISemEntry }     from "./src/queue/index.ts";

// Config
export { getConfig, setConfig, getAllConfig, initConfig } from "./src/config/mod.ts";

// Logging
export { log }                             from "./src/logging/index.ts";
export type { LogLevel }                   from "./src/logging/types.ts";

// Text assets
export { registerText, getText }           from "./src/assets/index.ts";
