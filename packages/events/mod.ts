/**
 * @module @ursamu/events
 * @description In-game event calendar with RSVP tracking and REST API for UrsaMU.
 *
 * Install via game config:
 * ```json
 * { "server": { "plugins": ["@ursamu/events"] } }
 * ```
 *
 * Subscribe to lifecycle events in another plugin:
 * ```ts
 * import { eventHooks } from "@ursamu/events";
 * eventHooks.on("event:created", (event) => console.log(event.title));
 * ```
 */

// Domain types
export type { IGameEvent, IEventRSVP } from "./src/types.ts";

// Database layer
export {
  counters,
  eventRsvps,
  formatDateTime,
  gameEvents,
  getNextEventNumber,
  parseDateTime,
} from "./src/db.ts";

// Pure helpers (testable without DBO)
export {
  buildEventFieldUpdate,
  buildNewEvent,
  buildNewRsvp,
  filterUpcoming,
  filterVisibleEvents,
  flagSetFromRaw,
  formatCapacity,
  groupByEventId,
  isAtCapacity,
  isEventEditField,
  isStaffFlags,
  isValidEventStatus,
  parseCreateArg,
  parseRsvpStatus,
  rsvpBlockReason,
  rsvpColor,
  sortEventsByStart,
  statusChangeHook,
  statusColor,
  summarizeRsvps,
  VALID_EVENT_STATUSES,
  VALID_RSVP_STATUSES,
} from "./src/helpers.ts";
export type {
  CreateArgResult,
  EventEditField,
  EventEditResult,
  INewEventInput,
  INewRsvpInput,
  IRsvpSummary,
  RsvpBlockReason,
} from "./src/helpers.ts";

// Event hooks
export { eventHooks } from "./src/hooks.ts";
export type { EventHookMap, IEventHooks } from "./src/hooks.ts";

// Service layer (mutations shared by commands + REST)
export {
  cancelEvent,
  cancelRsvp,
  countUpcomingEvents,
  createEvent,
  createEventFromStrings,
  deleteEvent,
  editEventField,
  getEventByNumber,
  listEvents,
  listUpcomingEvents,
  resolveEvent,
  resolvePlayerName,
  setEventStatus,
  updateEventFields,
  upsertRsvp,
  withRsvpSummary,
} from "./src/service.ts";
export type {
  ServiceErr,
  ServiceOk,
  ServiceResult,
  UpsertRsvpValue,
} from "./src/service.ts";

// Staff / scene bridges
export {
  hasStaffConsole,
  registerEventsStaffNav,
  unregisterEventsStaffNav,
} from "./src/staff-nav-bridge.ts";
export {
  UPCOMING_KEY,
  publishEventsUpcomingBadge,
  registerEventsBadgeHooks,
  removeEventsBadgeHooks,
} from "./src/staff-badge-bridge.ts";
export {
  offEventSceneHint,
  onEventSceneHint,
  registerSceneBridge,
  removeSceneBridge,
} from "./src/scene-bridge.ts";
export type { EventSceneHint } from "./src/scene-bridge.ts";

// Version / identity
export {
  EVENTS_DESCRIPTION,
  EVENTS_PLUGIN_ID,
  EVENTS_TITLE,
  EVENTS_VERSION,
} from "./src/version.ts";

// Plugin entry point
export { default, default as eventsPlugin } from "./src/index.ts";
