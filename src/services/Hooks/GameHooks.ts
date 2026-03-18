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

// ─── hook map ─────────────────────────────────────────────────────────────────

export type GameHookMap = {
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
};

type HandlerList = { [K in keyof GameHookMap]: GameHookMap[K][] };

// ─── registry ─────────────────────────────────────────────────────────────────

const _handlers: HandlerList = {
  "player:say":      [],
  "player:pose":     [],
  "player:page":     [],
  "player:move":     [],
  "player:login":    [],
  "player:logout":   [],
  "channel:message": [],
  "scene:created":   [],
  "scene:pose":      [],
  "scene:set":       [],
  "scene:title":     [],
  "scene:clear":     [],
};

// ─── public API ───────────────────────────────────────────────────────────────

export interface IGameHooks {
  on<K extends keyof GameHookMap>(event: K, handler: GameHookMap[K]): void;
  off<K extends keyof GameHookMap>(event: K, handler: GameHookMap[K]): void;
  emit<K extends keyof GameHookMap>(event: K, ...args: Parameters<GameHookMap[K]>): Promise<void>;
}

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
    const list = _handlers[event] as GameHookMap[K][];
    if (!list.includes(handler)) list.push(handler);
  },

  /** Remove a previously registered handler. */
  off<K extends keyof GameHookMap>(event: K, handler: GameHookMap[K]): void {
    const list = _handlers[event] as GameHookMap[K][];
    const idx  = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  },

  /** Fire all registered handlers for an event. Errors are caught and logged. */
  async emit<K extends keyof GameHookMap>(
    event: K,
    ...args: Parameters<GameHookMap[K]>
  ): Promise<void> {
    for (const handler of [...(_handlers[event] as ((...a: Parameters<GameHookMap[K]>) => void | Promise<void>)[])]) {
      try {
        await (handler as (...a: Parameters<GameHookMap[K]>) => void | Promise<void>)(...args);
      } catch (e) {
        console.error(`[GameHooks] Uncaught error in "${event}" handler:`, e);
      }
    }
  },
};
