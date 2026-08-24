/**
 * Shared mutation/query service for commands + REST.
 * Side effects: DBO + eventHooks only (no mush send/sdk).
 */

import { dbojs } from "@ursamu/mush";
import {
  eventRsvps,
  gameEvents,
  getNextEventNumber,
  parseDateTime,
} from "./db.ts";
import {
  buildEventFieldUpdate,
  buildNewEvent,
  buildNewRsvp,
  filterUpcoming,
  filterVisibleEvents,
  isValidEventStatus,
  parseRsvpStatus,
  rsvpBlockReason,
  sortEventsByStart,
  statusChangeHook,
  summarizeRsvps,
} from "./helpers.ts";
import { eventHooks } from "./hooks.ts";
import type { IEventRSVP, IGameEvent } from "./types.ts";

export type ServiceErr = { ok: false; error: string; status: number };
export type ServiceOk<T> = { ok: true; value: T };
export type ServiceResult<T> = ServiceOk<T> | ServiceErr;

function err(error: string, status: number): ServiceErr {
  return { ok: false, error, status };
}

function ok<T>(value: T): ServiceOk<T> {
  return { ok: true, value };
}

export async function resolvePlayerName(playerId: string): Promise<string> {
  const p = await dbojs.queryOne({ id: playerId });
  return (p && p.data?.name) || playerId;
}

export async function resolveEvent(
  idParam: string,
): Promise<IGameEvent | null> {
  const num = parseInt(idParam, 10);
  if (!isNaN(num) && String(num) === idParam.trim()) {
    return await gameEvents.queryOne({ number: num }) || null;
  }
  return await gameEvents.queryOne({ id: idParam }) || null;
}

export async function getEventByNumber(
  n: number,
): Promise<IGameEvent | null> {
  return await gameEvents.queryOne({ number: n }) || null;
}

export async function listEvents(opts: {
  staff: boolean;
  status?: string | null;
  tag?: string | null;
  from?: number | null;
  to?: number | null;
}): Promise<IGameEvent[]> {
  let all = filterVisibleEvents(await gameEvents.find({}), opts.staff);
  if (opts.status) all = all.filter((e) => e.status === opts.status);
  if (opts.tag) all = all.filter((e) => e.tags.includes(opts.tag!));
  if (opts.from != null) all = all.filter((e) => e.startTime >= opts.from!);
  if (opts.to != null) all = all.filter((e) => e.startTime <= opts.to!);
  return sortEventsByStart(all);
}

export async function listUpcomingEvents(
  now = Date.now(),
): Promise<IGameEvent[]> {
  return sortEventsByStart(filterUpcoming(await gameEvents.find({}), now));
}

export async function withRsvpSummary(
  ev: IGameEvent,
  userId?: string,
) {
  const all = await eventRsvps.find({ eventId: ev.id });
  const summary = summarizeRsvps(all);
  const myRsvp = userId
    ? all.find((r) => r.playerId === userId) || null
    : null;
  return {
    ...ev,
    attendingCount: summary.attendingCount,
    maybeCount: summary.maybeCount,
    declinedCount: summary.declinedCount,
    myRsvp: myRsvp ? myRsvp.status : null,
    attendees: summary.attending.map((r) => ({
      id: r.playerId,
      name: r.playerName,
    })),
    maybes: summary.maybe.map((r) => ({
      id: r.playerId,
      name: r.playerName,
    })),
    rsvps: all,
  };
}

export async function createEvent(input: {
  title: string;
  description: string;
  startTime: number;
  createdBy: string;
  createdByName?: string;
  location?: string;
  endTime?: number;
  tags?: string[];
  maxAttendees?: number;
}): Promise<ServiceResult<IGameEvent>> {
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title || !description) {
    return err("title and description are required", 400);
  }
  if (!Number.isFinite(input.startTime)) {
    return err("Invalid startTime", 400);
  }

  const num = await getNextEventNumber();
  const createdByName = input.createdByName ??
    await resolvePlayerName(input.createdBy);
  const ev = buildNewEvent({
    number: num,
    title,
    description,
    startTime: input.startTime,
    endTime: input.endTime,
    location: input.location,
    tags: input.tags ?? [],
    maxAttendees: input.maxAttendees ?? 0,
    createdBy: input.createdBy,
    createdByName,
  });
  await gameEvents.create(ev);
  await eventHooks.emit("event:created", ev);
  return ok(ev);
}

export async function createEventFromStrings(input: {
  title: string;
  description: string;
  startTimeRaw: string | number;
  createdBy: string;
  createdByName?: string;
  location?: string;
  endTimeRaw?: string | number;
  tags?: string[];
  maxAttendees?: number;
}): Promise<ServiceResult<IGameEvent>> {
  const startTime = typeof input.startTimeRaw === "number"
    ? input.startTimeRaw
    : parseDateTime(String(input.startTimeRaw));
  if (!startTime) return err("Invalid startTime format", 400);

  let endTime: number | undefined;
  if (input.endTimeRaw != null && input.endTimeRaw !== "") {
    endTime = typeof input.endTimeRaw === "number"
      ? input.endTimeRaw
      : parseDateTime(String(input.endTimeRaw)) ?? undefined;
    if (input.endTimeRaw && endTime == null) {
      return err("Invalid endTime format", 400);
    }
  }

  return createEvent({
    title: input.title,
    description: input.description,
    startTime,
    endTime,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    location: input.location,
    tags: input.tags,
    maxAttendees: input.maxAttendees,
  });
}

export async function updateEventFields(
  ev: IGameEvent,
  patch: Partial<IGameEvent>,
): Promise<IGameEvent> {
  const updated: IGameEvent = {
    ...ev,
    ...patch,
    updatedAt: Date.now(),
  };
  await gameEvents.update({ id: ev.id }, updated);
  const hook = statusChangeHook(ev.status, updated.status);
  await eventHooks.emit(hook, updated);
  return updated;
}

export async function editEventField(
  ev: IGameEvent,
  field: string,
  value: string,
): Promise<ServiceResult<IGameEvent>> {
  const fieldResult = buildEventFieldUpdate(field, value);
  if (!fieldResult.ok) return err(fieldResult.error, 400);
  const updated = await updateEventFields(ev, fieldResult.update);
  return ok(updated);
}

export async function setEventStatus(
  ev: IGameEvent,
  statusRaw: string,
): Promise<ServiceResult<IGameEvent>> {
  const status = statusRaw.trim().toLowerCase();
  if (!isValidEventStatus(status)) {
    return err(
      "Status must be: upcoming, active, completed, cancelled",
      400,
    );
  }
  const updated = await updateEventFields(ev, { status });
  return ok(updated);
}

export async function cancelEvent(
  ev: IGameEvent,
): Promise<IGameEvent> {
  return updateEventFields(ev, { status: "cancelled" });
}

export async function deleteEvent(ev: IGameEvent): Promise<void> {
  await gameEvents.delete({ id: ev.id });
  await eventRsvps.delete({ eventId: ev.id });
  await eventHooks.emit("event:deleted", ev);
}

export type UpsertRsvpValue = { rsvp: IEventRSVP; created: boolean };

export async function upsertRsvp(input: {
  event: IGameEvent;
  playerId: string;
  playerName?: string;
  statusRaw: string;
  note?: string;
}): Promise<ServiceResult<UpsertRsvpValue>> {
  const status = parseRsvpStatus(input.statusRaw);
  if (!status) {
    return err("status must be attending, maybe, or declined", 400);
  }

  const attending = await eventRsvps.find({
    eventId: input.event.id,
    status: "attending",
  });
  const existing = await eventRsvps.queryOne({
    eventId: input.event.id,
    playerId: input.playerId,
  });
  const alreadyAttending = existing?.status === "attending";

  const block = rsvpBlockReason(
    input.event,
    status,
    attending.length,
    alreadyAttending,
  );
  if (block === "cancelled") {
    return err("Event is cancelled", 400);
  }
  if (block === "completed") {
    return err("Event has already occurred", 400);
  }
  if (block === "at_capacity") {
    return err("Event is at capacity", 409);
  }

  const playerName = input.playerName ??
    await resolvePlayerName(input.playerId);

  if (existing) {
    const updated = {
      ...existing,
      status,
      note: input.note,
      createdAt: existing.createdAt,
    };
    await eventRsvps.update({ id: existing.id }, updated);
    await eventHooks.emit("event:rsvp", input.event, updated);
    return ok({ rsvp: updated, created: false });
  }

  const rsvp = buildNewRsvp({
    eventId: input.event.id,
    playerId: input.playerId,
    playerName,
    status,
    note: input.note,
  });
  await eventRsvps.create(rsvp);
  await eventHooks.emit("event:rsvp", input.event, rsvp);
  return ok({ rsvp, created: true });
}

export async function cancelRsvp(input: {
  event: IGameEvent;
  playerId: string;
}): Promise<ServiceResult<IEventRSVP>> {
  const existing = await eventRsvps.queryOne({
    eventId: input.event.id,
    playerId: input.playerId,
  });
  if (!existing) return err("No RSVP to cancel", 404);
  await eventRsvps.delete({ id: existing.id });
  await eventHooks.emit("event:rsvp-cancelled", input.event, existing);
  return ok(existing);
}

/** Count upcoming/active events (staff badge). */
export async function countUpcomingEvents(
  now = Date.now(),
): Promise<number> {
  try {
    return (await listUpcomingEvents(now)).length;
  } catch {
    return 0;
  }
}
