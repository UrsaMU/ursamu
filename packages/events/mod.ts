/**
 * @module @ursamu/events
 *
 * In-game event calendar with RSVP tracking and REST API for UrsaMU.
 */

export { default as eventsPlugin, default } from "./src/index.ts";
export { gameEvents, eventRsvps, getNextEventNumber, parseDateTime, formatDateTime } from "./src/db.ts";
export { eventHooks } from "./src/hooks.ts";
export type { IGameEvent, IEventRSVP } from "./src/types.ts";
export type { EventHookMap, IEventHooks } from "./src/hooks.ts";
