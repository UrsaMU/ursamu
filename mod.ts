/**
 * @module ursamu
 * @description The core UrsaMU engine library.
 *
 * This module exports the main entry points for the UrsaMU engine, including
 * the `mu` engine instance, database object creation utilities, and the Telnet server.
 *
 * @example
 * ```ts
 * import { mu } from "@ursamu/ursamu";
 *
 * // Initialize the engine
 * await mu(config);
 * ```
 */

// Export Interfaces
export * from "./src/interfaces/index.ts";

// Export Core Factory/Services
export { createObj } from "./src/services/DBObjs/DBObjs.ts";
export { mu, checkAndCreateSuperuser } from "./src/main.ts";
export { startTelnetServer } from "./src/services/telnet/telnet.ts";

// Export Plugin API — available to game projects and external plugins
export { send } from "./src/services/broadcast/broadcast.ts";
export { DBO } from "./src/services/Database/database.ts";
export { registerPluginRoute, registerUIComponent, unregisterUIComponent, getRegisteredUIComponents } from "./src/app.ts";
export type { IUIComponent } from "./src/app.ts";
export { dbojs } from "./src/services/Database/index.ts";
export { gameHooks } from "./src/services/Hooks/GameHooks.ts";
export { registerStatSystem, getStatSystem, getDefaultStatSystem, getStatSystemNames } from "./src/services/StatSystem/index.ts";
export type { IStatSystem } from "./src/@types/IStatSystem.ts";
export type {
  GameHookMap,
  SayEvent,
  PoseEvent,
  PageEvent,
  MoveEvent,
  SessionEvent,
  ChannelMessageEvent,
  SceneCreatedEvent,
  ScenePoseEvent,
  SceneSetEvent,
  SceneTitleEvent,
  SceneClearEvent,
  MailReceivedEvent,
  ObjectCreatedEvent,
  ObjectDestroyedEvent,
  ObjectModifiedEvent,
} from "./src/services/Hooks/GameHooks.ts";

// Export WebSocket service — available to plugins that need to reach connected sockets
export { wsService } from "./src/services/WebSocket/index.ts";
export type { UserSocket } from "./src/@types/IMSocket.ts";
import { wsService as _wsService } from "./src/services/WebSocket/index.ts";

// Export command registration and plugin type — available to all plugins and game projects
export { addCmd, cmds, registerScript, registerCmdMiddleware } from "./src/services/commands/cmdParser.ts";

// Engine execution context — the substrate that all command handling builds on
export type { GameContext } from "./src/engine/context.ts";
export { buildContext } from "./src/engine/context.ts";

// Softcode extension API — register custom functions and %x substitutions from plugins
export { register as registerSoftcodeFunc } from "./src/services/Softcode/stdlib/registry.ts";
export { registerSub as registerSoftcodeSub } from "./src/services/Softcode/stdlib/subRegistry.ts";
export type { StdlibFn as SoftcodeFn } from "./src/services/Softcode/stdlib/registry.ts";
export type { SubHandler as SoftcodeSubHandler } from "./src/services/Softcode/stdlib/subRegistry.ts";
// Softcode evaluator — exposed so plugin integration tests can drive real
// TinyMUX evaluation against seeded attributes (rather than mocking attr.get).
export { softcodeService } from "./src/services/Softcode/index.ts";
export type { SoftcodeContext } from "./src/services/Softcode/index.ts";
// Lock function registry — register custom lock functions from plugins
export { registerLockFunc } from "./src/utils/lockFuncs.ts";
export type { LockFunc } from "./src/utils/lockFuncs.ts";
export { evaluateLock, validateLock } from "./src/utils/evaluateLock.ts";
// Format handlers — register plugin-level NAMEFORMAT/DESCFORMAT/CONFORMAT/EXITFORMAT
// fallbacks (priority: softcode attr > plugin handler > built-in default)
export {
  registerFormatHandler,
  unregisterFormatHandler,
} from "./src/utils/formatHandlers.ts";
export type { FormatHandler, FormatSlot } from "./src/utils/formatHandlers.ts";
// Native layout helpers (TS-side) — block-style header/divider/footer rules for
// command output. Distinct from the inline softcode helpers of the same name
// registered in src/services/Softcode/stdlib/string.ts.
export { header, divider, footer } from "./src/utils/format.ts";
// resolveFormat — shared helper for commands that want format-attr / plugin-handler /
// built-in default rendering (used by `look`; reusable by `who`, `@ps`, external plugins).
export { resolveFormat, resolveFormatOr } from "./src/utils/resolveFormat.ts";
// resolveGlobalFormat — two-tier lookup (#0 → enactor) for global-list commands
// (WHO, @ps, +event/list, +mail, +bb, etc.) that aren't bound to a specific target.
export { resolveGlobalFormat, resolveGlobalFormatOr } from "./src/utils/resolveGlobalFormat.ts";
// Plugin lifecycle management — available to external plugins that need to read their config
export { PluginConfigManager } from "./src/services/Config/plugin.ts";
export type { IMiddlewareFunction } from "./src/@types/IMiddlewareFunction.ts";
export type { IContext } from "./src/@types/IContext.ts";
export type { IPlugin, IPluginDependency } from "./src/@types/IPlugin.ts";
export type { IUrsamuSDK, IDBObj } from "./src/@types/UrsamuSDK.ts";
export type { IDBOBJ } from "./src/@types/IDBObj.ts";

// joinSocketToRoom — lets plugins (e.g. channel-plugin) subscribe a socket to a room
// after a player:login event without coupling to the WebSocket implementation.
export function joinSocketToRoom(socketId: string, room: string): void {
  _wsService.joinSocketToRoom(socketId, room);
}

// Hide internal class implementations by not exporting everything

if (import.meta.main) {
  await import("./src/cli/ursamu.ts");
}