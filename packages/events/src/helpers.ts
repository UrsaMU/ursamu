/**
 * Pure helpers for @ursamu/events — no DBO / mush side effects.
 * Shared by commands, router, and unit tests.
 */

import type { IEventRSVP, IGameEvent } from "./types.ts";
import { parseDateTime } from "./db.ts";

// ─── staff / flags ────────────────────────────────────────────────────────────

const STAFF_FLAGS = new Set(["admin", "wizard", "superuser"]);

/**
 * Normalize stored flags to a lowercase Set.
 * Accepts Set, array, or space/comma-delimited string (DBO shape varies).
 */
export function flagSetFromRaw(raw: unknown): Set<string> {
  if (raw instanceof Set) {
    return new Set([...raw].map((f) => String(f).toLowerCase()));
  }
  if (Array.isArray(raw)) {
    return new Set(raw.map((f) => String(f).toLowerCase()));
  }
  return new Set(
    String(raw || "")
      .split(/[\s,|]+/)
      .map((f) => f.toLowerCase())
      .filter(Boolean),
  );
}

/** True when the flag set includes any staff role used by this package. */
export function isStaffFlags(flags: { has(f: string): boolean } | unknown): boolean {
  const set = flags && typeof (flags as { has?: unknown }).has === "function"
    ? flags as { has(f: string): boolean }
    : flagSetFromRaw(flags);
  for (const f of STAFF_FLAGS) {
    if (set.has(f)) return true;
  }
  return false;
}

// ─── display colors (MUSH codes) ──────────────────────────────────────────────

export function statusColor(s: IGameEvent["status"]): string {
  switch (s) {
    case "upcoming":
      return "%ch%cg";
    case "active":
      return "%ch%cy";
    case "completed":
      return "%cn";
    case "cancelled":
      return "%ch%cr";
  }
}

export function rsvpColor(s: IEventRSVP["status"]): string {
  switch (s) {
    case "attending":
      return "%ch%cg";
    case "maybe":
      return "%cy";
    case "declined":
      return "%cr";
  }
}

// ─── RSVP status parsing ──────────────────────────────────────────────────────

const RSVP_ALIASES: Record<string, IEventRSVP["status"]> = {
  attending: "attending",
  yes: "attending",
  maybe: "maybe",
  declined: "declined",
  decline: "declined",
  no: "declined",
};

/** Map free-text RSVP choice to a canonical status, or null if invalid. */
export function parseRsvpStatus(raw: string): IEventRSVP["status"] | null {
  const key = raw.trim().toLowerCase();
  return RSVP_ALIASES[key] ?? null;
}

export const VALID_RSVP_STATUSES: readonly IEventRSVP["status"][] = [
  "attending",
  "maybe",
  "declined",
];

// ─── event status ─────────────────────────────────────────────────────────────

export const VALID_EVENT_STATUSES: readonly IGameEvent["status"][] = [
  "upcoming",
  "active",
  "completed",
  "cancelled",
];

export function isValidEventStatus(
  s: string,
): s is IGameEvent["status"] {
  return (VALID_EVENT_STATUSES as readonly string[]).includes(s);
}

// ─── capacity ─────────────────────────────────────────────────────────────────

/**
 * Whether a new (or upgraded) attending RSVP would exceed maxAttendees.
 * maxAttendees === 0 means unlimited.
 */
export function isAtCapacity(
  maxAttendees: number,
  attendingCount: number,
  alreadyAttending: boolean,
): boolean {
  if (maxAttendees <= 0) return false;
  if (alreadyAttending) return false;
  return attendingCount >= maxAttendees;
}

/** Human-readable capacity label: "3" or "3/10". */
export function formatCapacity(
  attendingCount: number,
  maxAttendees: number,
): string {
  if (maxAttendees > 0) return `${attendingCount}/${maxAttendees}`;
  return String(attendingCount);
}

// ─── RSVP eligibility ─────────────────────────────────────────────────────────

export type RsvpBlockReason =
  | "cancelled"
  | "completed"
  | "at_capacity"
  | null;

/**
 * Whether a player may place/update an RSVP with the given status.
 * Capacity only applies when status is "attending".
 */
export function rsvpBlockReason(
  event: Pick<IGameEvent, "status" | "maxAttendees">,
  status: IEventRSVP["status"],
  attendingCount: number,
  alreadyAttending: boolean,
): RsvpBlockReason {
  if (event.status === "cancelled") return "cancelled";
  if (event.status === "completed") return "completed";
  if (
    status === "attending" &&
    isAtCapacity(event.maxAttendees, attendingCount, alreadyAttending)
  ) {
    return "at_capacity";
  }
  return null;
}

// ─── list filters ─────────────────────────────────────────────────────────────

/** Hide cancelled events from non-staff. */
export function filterVisibleEvents(
  events: IGameEvent[],
  staff: boolean,
): IGameEvent[] {
  if (staff) return [...events];
  return events.filter((e) => e.status !== "cancelled");
}

/** Sort ascending by startTime (stable for equal times via number). */
export function sortEventsByStart(events: IGameEvent[]): IGameEvent[] {
  return [...events].sort((a, b) => {
    const d = a.startTime - b.startTime;
    return d !== 0 ? d : a.number - b.number;
  });
}

/** Upcoming/active events whose start is at or after `now`. */
export function filterUpcoming(
  events: IGameEvent[],
  now = Date.now(),
): IGameEvent[] {
  return events.filter(
    (e) =>
      (e.status === "upcoming" || e.status === "active") &&
      e.startTime >= now,
  );
}

// ─── RSVP grouping / summary ──────────────────────────────────────────────────

export function groupByEventId<T extends { eventId: string }>(
  items: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const arr = map.get(item.eventId) || [];
    arr.push(item);
    map.set(item.eventId, arr);
  }
  return map;
}

export interface IRsvpSummary {
  attending: IEventRSVP[];
  maybe: IEventRSVP[];
  declined: IEventRSVP[];
  attendingCount: number;
  maybeCount: number;
  declinedCount: number;
}

export function summarizeRsvps(rsvps: IEventRSVP[]): IRsvpSummary {
  const attending = rsvps.filter((r) => r.status === "attending");
  const maybe = rsvps.filter((r) => r.status === "maybe");
  const declined = rsvps.filter((r) => r.status === "declined");
  return {
    attending,
    maybe,
    declined,
    attendingCount: attending.length,
    maybeCount: maybe.length,
    declinedCount: declined.length,
  };
}

// ─── field edits (staff) ──────────────────────────────────────────────────────

export type EventEditField =
  | "title"
  | "description"
  | "location"
  | "starttime"
  | "endtime"
  | "maxattendees"
  | "tags";

export type EventEditResult =
  | { ok: true; update: Partial<IGameEvent> }
  | { ok: false; error: string };

const EDIT_FIELDS = new Set<string>([
  "title",
  "description",
  "location",
  "starttime",
  "endtime",
  "maxattendees",
  "tags",
]);

export function isEventEditField(field: string): field is EventEditField {
  return EDIT_FIELDS.has(field);
}

/** Build a Partial update for +event/edit and REST PATCH field mapping. */
export function buildEventFieldUpdate(
  field: string,
  value: string,
): EventEditResult {
  const f = field.trim().toLowerCase();
  if (!isEventEditField(f)) {
    return {
      ok: false,
      error:
        `Unknown field "${field}". Valid: title, description, location, starttime, endtime, maxattendees, tags`,
    };
  }

  switch (f) {
    case "title":
      if (!value.trim()) return { ok: false, error: "title cannot be empty" };
      return { ok: true, update: { title: value.trim() } };
    case "description":
      if (!value.trim()) {
        return { ok: false, error: "description cannot be empty" };
      }
      return { ok: true, update: { description: value.trim() } };
    case "location":
      return { ok: true, update: { location: value.trim() || undefined } };
    case "starttime": {
      const t = parseDateTime(value);
      if (!t) {
        return {
          ok: false,
          error: `Invalid date "${value}". Use YYYY-MM-DD or YYYY-MM-DD HH:MM`,
        };
      }
      return { ok: true, update: { startTime: t } };
    }
    case "endtime": {
      const t = parseDateTime(value);
      if (!t) {
        return {
          ok: false,
          error: `Invalid date "${value}". Use YYYY-MM-DD or YYYY-MM-DD HH:MM`,
        };
      }
      return { ok: true, update: { endTime: t } };
    }
    case "maxattendees": {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 0) {
        return {
          ok: false,
          error: "maxattendees must be a non-negative integer",
        };
      }
      return { ok: true, update: { maxAttendees: n } };
    }
    case "tags":
      return {
        ok: true,
        update: {
          tags: value.split(",").map((t) => t.trim()).filter(Boolean),
        },
      };
  }
}

// ─── create payload parsing (+event/create) ───────────────────────────────────

export type CreateArgResult =
  | {
    ok: true;
    title: string;
    dateStr: string;
    description: string;
    startTime: number;
  }
  | { ok: false; error: string };

/**
 * Parse `title=YYYY-MM-DD HH:MM/description` used by +event/create.
 */
export function parseCreateArg(arg: string): CreateArgResult {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) {
    return {
      ok: false,
      error: "Usage: +event/create <title>=<YYYY-MM-DD HH:MM>/<description>",
    };
  }
  const title = arg.slice(0, eqIdx).trim();
  const rest = arg.slice(eqIdx + 1);
  const slash = rest.indexOf("/");
  if (slash === -1) {
    return {
      ok: false,
      error: "Usage: +event/create <title>=<YYYY-MM-DD HH:MM>/<description>",
    };
  }
  const dateStr = rest.slice(0, slash).trim();
  const description = rest.slice(slash + 1).trim();

  if (!title || !description) {
    return {
      ok: false,
      error: "Usage: +event/create <title>=<YYYY-MM-DD HH:MM>/<description>",
    };
  }

  const startTime = parseDateTime(dateStr);
  if (!startTime) {
    return {
      ok: false,
      error:
        `Invalid date "${dateStr}". Use format: YYYY-MM-DD or YYYY-MM-DD HH:MM`,
    };
  }

  return { ok: true, title, dateStr, description, startTime };
}

// ─── status change hooks ──────────────────────────────────────────────────────

/**
 * Which lifecycle hook to fire after a status mutation.
 * Non-status field updates always use "event:updated".
 */
export function statusChangeHook(
  oldStatus: IGameEvent["status"],
  newStatus: IGameEvent["status"],
): "event:cancelled" | "event:completed" | "event:updated" {
  if (oldStatus === newStatus) return "event:updated";
  if (newStatus === "cancelled") return "event:cancelled";
  if (newStatus === "completed") return "event:completed";
  return "event:updated";
}

// ─── factory ──────────────────────────────────────────────────────────────────

export interface INewEventInput {
  number: number;
  title: string;
  description: string;
  startTime: number;
  createdBy: string;
  createdByName: string;
  location?: string;
  endTime?: number;
  tags?: string[];
  maxAttendees?: number;
  now?: number;
}

/** Build a new IGameEvent record (does not persist). */
export function buildNewEvent(input: INewEventInput): IGameEvent {
  const now = input.now ?? Date.now();
  return {
    id: `ev-${input.number}`,
    number: input.number,
    title: input.title,
    description: input.description,
    location: input.location,
    startTime: input.startTime,
    endTime: input.endTime,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    status: "upcoming",
    tags: input.tags ?? [],
    maxAttendees: input.maxAttendees ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

export interface INewRsvpInput {
  eventId: string;
  playerId: string;
  playerName: string;
  status: IEventRSVP["status"];
  note?: string;
  id?: string;
  now?: number;
}

/** Build a new IEventRSVP record (does not persist). */
export function buildNewRsvp(input: INewRsvpInput): IEventRSVP {
  return {
    id: input.id ?? crypto.randomUUID(),
    eventId: input.eventId,
    playerId: input.playerId,
    playerName: input.playerName,
    status: input.status,
    note: input.note,
    createdAt: input.now ?? Date.now(),
  };
}
