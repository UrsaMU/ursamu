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
export { registerPluginRoute } from "./src/app.ts";
export { dbojs } from "./src/services/Database/index.ts";
export { gameHooks } from "./src/services/Hooks/GameHooks.ts";
export { seedBoards } from "./src/plugins/bboards/db.ts";
export type { ISeedBoardOptions } from "./src/plugins/bboards/db.ts";
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
} from "./src/services/Hooks/GameHooks.ts";

// Export WebSocket service — available to plugins that need to reach connected sockets
export { wsService } from "./src/services/WebSocket/index.ts";
export type { UserSocket } from "./src/@types/IMSocket.ts";

// Export command registration and plugin type — available to all plugins and game projects
export { addCmd } from "./src/services/commands/cmdParser.ts";
export type { IPlugin } from "./src/@types/IPlugin.ts";
export type { IUrsamuSDK } from "./src/@types/UrsamuSDK.ts";

// Hide internal class implementations by not exporting everything

if (import.meta.main) {
  await import("./src/cli/ursamu.ts");
}