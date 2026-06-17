/**
 * MUSH-specific hook events. Augments CoreHookMap via declaration merging
 * so any code that imports gameHooks from @ursamu/core sees these events.
 */

export interface SayEvent {
  actorId: string;
  actorName: string;
  roomId: string;
  message: string;
  socketId?: string;
}

export interface PoseEvent {
  actorId: string;
  actorName: string;
  roomId: string;
  content: string;
  isSemipose: boolean;
  socketId?: string;
}

export interface PageEvent {
  actorId: string;
  actorName: string;
  targetId: string;
  targetName: string;
  message: string;
}

export interface MoveEvent {
  actorId: string;
  actorName: string;
  fromRoomId: string;
  toRoomId: string;
  fromRoomName: string;
  toRoomName: string;
  exitName: string;
}

export interface SessionEvent {
  actorId: string;
  actorName: string;
  socketId?: string;
}

export interface ChannelMessageEvent {
  channelName: string;
  senderId: string;
  senderName: string;
  message: string;
}

export interface ObjectEvent {
  objectId: string;
  objectName: string;
  objectType: string;
  actorId: string;
  actorName: string;
  locationId?: string;
}

export interface ObjectMovedEvent {
  objectId: string;
  from: string | null;
  to: string | null;
  cause: string;
  actorId?: string;
}

// Aliases used by the scene plugin and mail system in src/
export type ObjectCreatedEvent   = ObjectEvent;
export type ObjectDestroyedEvent = ObjectEvent;
export type ObjectModifiedEvent  = ObjectEvent;

export interface SceneCreatedEvent { sceneId: string; actorId: string; roomId: string; sceneName?: string; [k: string]: unknown; }
export interface ScenePoseEvent    { sceneId: string; actorId: string; pose?: string; type?: string; msg?: string; sceneName?: string; [k: string]: unknown; }
export interface SceneSetEvent     { sceneId: string; actorId: string; key?: string; value?: unknown; sceneName?: string; [k: string]: unknown; }
export interface SceneTitleEvent   { sceneId: string; actorId: string; title?: string; oldName?: string; [k: string]: unknown; }
export interface SceneClearEvent   { sceneId: string; actorId: string; sceneName?: string; [k: string]: unknown; }
export interface MailReceivedEvent { to: string; from: string; subject: string; body: string; }

/** Marker type — imported from mod.ts to signal that MushHookMap augmentation is active. */
// deno-lint-ignore no-empty-interface
export interface MushHookMap {}
