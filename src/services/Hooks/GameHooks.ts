/**
 * Bridge: re-exports gameHooks and all event types from @ursamu/core and @ursamu/mush.
 */
export { gameHooks } from "@ursamu/core";
export type { CoreHookMap as GameHookMap } from "@ursamu/core";

export type {
  SayEvent, PoseEvent, PageEvent, MoveEvent, SessionEvent,
  ChannelMessageEvent, ObjectEvent, ObjectMovedEvent,
  ObjectCreatedEvent, ObjectDestroyedEvent, ObjectModifiedEvent,
  SceneCreatedEvent, ScenePoseEvent, SceneSetEvent, SceneTitleEvent,
  SceneClearEvent, MailReceivedEvent,
} from "@ursamu/mush";
