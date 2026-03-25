// ─── event payload types ──────────────────────────────────────────────────────

export interface SayEvent {
  actorId:   string;
  actorName: string;
  /** ID of the room where the message was spoken. */
  roomId:    string;
  message:   string;
}

export interface PoseEvent {
  actorId:    string;
  actorName:  string;
  /** ID of the room where the pose was emitted. */
  roomId:     string;
  /** Full formatted content, e.g. "Alice grins." */
  content:    string;
  /** True when the `;` shorthand was used (no space between name and text). */
  isSemipose: boolean;
}

export interface PageEvent {
  actorId:    string;
  actorName:  string;
  targetId:   string;
  targetName: string;
  message:    string;
}

export interface MoveEvent {
  actorId:      string;
  actorName:    string;
  fromRoomId:   string;
  toRoomId:     string;
  fromRoomName: string;
  toRoomName:   string;
  /** Name of the exit taken, e.g. "North". */
  exitName:     string;
}

export interface SessionEvent {
  actorId:   string;
  actorName: string;
  /** WebSocket socket ID — used by plugins to subscribe the socket to rooms. */
  socketId?: string;
}

export interface ChannelMessageEvent {
  channelName: string;
  senderId:    string;
  senderName:  string;
  message:     string;
}

export interface SceneCreatedEvent {
  sceneId:   string;
  sceneName: string;
  /** Room ID where the scene is set. */
  roomId:    string;
  actorId:   string;
  actorName: string;
  sceneType: string;
}

export interface ScenePoseEvent {
  sceneId:   string;
  sceneName: string;
  /** Room ID where the scene is set. */
  roomId:    string;
  actorId:   string;
  actorName: string;
  msg:       string;
  /** The pose type: "pose", "ooc", or "set". */
  type:      "pose" | "ooc" | "set";
}

export interface SceneSetEvent {
  sceneId:     string;
  sceneName:   string;
  /** Room ID where the scene is set. */
  roomId:      string;
  actorId:     string;
  actorName:   string;
  /** The scene-set description text. */
  description: string;
}

export interface SceneTitleEvent {
  sceneId:   string;
  oldName:   string;
  newName:   string;
  actorId:   string;
  actorName: string;
}

export interface SceneClearEvent {
  sceneId:   string;
  sceneName: string;
  actorId:   string;
  actorName: string;
  /** The new status, e.g. "closed" or "finished". */
  status:    string;
}

export interface MailReceivedEvent {
  /** ID of the player who received the mail. */
  recipientId: string;
  /** ID of the new mail record in mail.messages. */
  mailId:      string;
  subject:     string;
  senderName:  string;
}

export interface ObjectCreatedEvent {
  objectId:   string;
  objectName: string;
  /** "room" | "exit" | "thing" | "player" */
  objectType: string;
  actorId:    string;
  actorName:  string;
  locationId?: string;
}

export interface ObjectDestroyedEvent {
  objectId:   string;
  objectName: string;
  objectType: string;
  actorId:    string;
  actorName:  string;
}

export interface ObjectModifiedEvent {
  objectId:   string;
  objectName: string;
  /** The field or action that was changed, e.g. "description", "flags", "name" */
  field:      string;
  actorId:    string;
  actorName:  string;
}

// ─── hook map ─────────────────────────────────────────────────────────────────
// Declared as an interface so plugins can extend it via declaration merging:
//
//   declare module "@ursamu/ursamu" {
//     interface GameHookMap {
//       "my:event": (payload: MyPayload) => void | Promise<void>;
//     }
//   }

export interface GameHookMap {
  /** A player said something in a room. */
  "player:say":      (e: SayEvent)            => void | Promise<void>;
  /** A player posed/emoted in a room. */
  "player:pose":     (e: PoseEvent)           => void | Promise<void>;
  /** A player paged another player. */
  "player:page":     (e: PageEvent)           => void | Promise<void>;
  /** A player moved through an exit. */
  "player:move":     (e: MoveEvent)           => void | Promise<void>;
  /** A player connected and logged in. */
  "player:login":    (e: SessionEvent)        => void | Promise<void>;
  /** A player disconnected. */
  "player:logout":   (e: SessionEvent)        => void | Promise<void>;
  /** A player spoke on a channel. */
  "channel:message": (e: ChannelMessageEvent) => void | Promise<void>;
  /** A new scene was opened. */
  "scene:created":   (e: SceneCreatedEvent)   => void | Promise<void>;
  /** A pose (any type) was added to a scene. */
  "scene:pose":      (e: ScenePoseEvent)      => void | Promise<void>;
  /** A scene-set description was posted. */
  "scene:set":       (e: SceneSetEvent)       => void | Promise<void>;
  /** The scene title was changed. */
  "scene:title":     (e: SceneTitleEvent)     => void | Promise<void>;
  /** The scene was closed or finished. */
  "scene:clear":     (e: SceneClearEvent)     => void | Promise<void>;
  /** A mail message was delivered to a recipient. */
  "mail:received":   (e: MailReceivedEvent)   => void | Promise<void>;
  /** A world object (room, exit, thing) was created by a builder. */
  "object:created":   (e: ObjectCreatedEvent)   => void | Promise<void>;
  /** A world object was destroyed by a builder. */
  "object:destroyed": (e: ObjectDestroyedEvent) => void | Promise<void>;
  /** A world object's field was modified by a builder. */
  "object:modified":  (e: ObjectModifiedEvent)  => void | Promise<void>;
  /** The engine has fully initialized and all plugins are loaded. */
  "engine:ready":     ()                        => void | Promise<void>;
};

// ─── registry ─────────────────────────────────────────────────────────────────
// Map-based (not a typed record) so plugins that extend GameHookMap via
// declaration merging can register handlers for dynamically-added event keys
// without modifying this file.  A typed record would limit keys to the compile-
// time snapshot of GameHookMap; a Map accepts any string at runtime.

type AnyHandler = (...args: unknown[]) => void | Promise<void>;
const _handlers = new Map<string, AnyHandler[]>();

/**
 * Lazily initialise and return the handler list for `event`.
 * Creating the list on first access avoids pre-allocating arrays for every
 * possible event name, including plugin-defined ones unknown at engine startup.
 */
function getList(event: string): AnyHandler[] {
  let list = _handlers.get(event);
  if (!list) { list = []; _handlers.set(event, list); }
  return list;
}

// ─── public API ───────────────────────────────────────────────────────────────

export interface IGameHooks {
  on<K extends keyof GameHookMap>(event: K, handler: GameHookMap[K]): void;
  off<K extends keyof GameHookMap>(event: K, handler: GameHookMap[K]): void;
  emit<K extends keyof GameHookMap>(event: K, ...args: Parameters<GameHookMap[K]>): Promise<void>;
}

/**
 * The global game-event bus.
 *
 * Subscribe to engine lifecycle events (player login/logout, say, pose,
 * page, move, channel, scene mutations) and react in real time.
 *
 * @example
 * ```ts
 * import { gameHooks } from "jsr:@ursamu/ursamu";
 *
 * gameHooks.on("player:say", ({ actorName, message }) => {
 *   console.log(`${actorName} says: ${message}`);
 * });
 * ```
 */
export const gameHooks: IGameHooks = {
  /**
   * Subscribe to a game lifecycle event.
   *
   * @example
   * ```ts
   * import { gameHooks } from "jsr:@ursamu/ursamu";
   *
   * gameHooks.on("player:say", ({ actorName, message, roomId }) => {
   *   console.log(`${actorName} says "${message}" in room ${roomId}`);
   * });
   * ```
   */
  on<K extends keyof GameHookMap>(event: K, handler: GameHookMap[K]): void {
    const list = getList(event as string);
    if (!list.includes(handler as AnyHandler)) list.push(handler as AnyHandler);
  },

  /** Remove a previously registered handler. */
  off<K extends keyof GameHookMap>(event: K, handler: GameHookMap[K]): void {
    const list = getList(event as string);
    const idx  = list.indexOf(handler as AnyHandler);
    if (idx !== -1) list.splice(idx, 1);
  },

  /** Fire all registered handlers for an event. Errors are caught and logged. */
  async emit<K extends keyof GameHookMap>(
    event: K,
    ...args: Parameters<GameHookMap[K]>
  ): Promise<void> {
    for (const handler of [...getList(event as string)]) {
      try {
        await handler(...(args as unknown[]));
      } catch (e) {
        console.error(`[GameHooks] Uncaught error in "${event}" handler:`, e);
      }
    }
  },
};
