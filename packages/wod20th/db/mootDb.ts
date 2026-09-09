// db/mootDb.ts -- Typed DBO wrapper for wod20th.moots collection.
//
// A moot is a scheduled gathering of a sept. Moots have their own
// lifecycle (scheduled -> opening-howl -> inner-sky -> cracking-the-bone
// -> revel -> closed) and accumulate attendance + renown awards, so they
// live in their own collection rather than inline on sept or character
// state. One sept may have multiple scheduled moots on the calendar but
// only one in-session ("open") moot at a time.

import { DBO } from "@ursamu/ursamu";
import { findCaernById, findCaernByRoom } from "./caernDb.ts";
import { findSeptByCaern } from "./septDb.ts";
import type { MoothPhase } from "../splats/wta/data/moots.ts";

export interface IMootAward {
  charId: string;
  track: "glory" | "honor" | "wisdom";
  amount: number;
  reason: string;
  awardedAt: number;
}

export interface IMoot {
  id: string;
  septId: string;
  scheduledAt: number;
  openedAt?: number;
  closedAt?: number;
  phase: MoothPhase;
  /** Char ids who have attended (clicked /attend) at least once. */
  attendees: string[];
  renownAwards: IMootAward[];
  notes: string[];
  createdAt: number;
  updatedAt: number;
}

const db = new DBO<IMoot>("wod20th.moots");

export async function createMoot(
  septId: string,
  scheduledAt: number,
  note?: string,
): Promise<IMoot> {
  const now = Date.now();
  const rec: IMoot = {
    id: crypto.randomUUID(),
    septId,
    scheduledAt,
    phase: "scheduled",
    attendees: [],
    renownAwards: [],
    notes: note ? [note] : [],
    createdAt: now,
    updatedAt: now,
  };
  await db.create(rec);
  return rec;
}

export async function findMoot(id: string): Promise<IMoot | null> {
  const r = await db.find({ id });
  return r[0] ?? null;
}

export async function findAllMoots(): Promise<IMoot[]> {
  const all = await db.find({});
  return all.sort((a, b) => a.scheduledAt - b.scheduledAt);
}

export async function findMootsForSept(septId: string): Promise<IMoot[]> {
  const all = await db.find({});
  return all
    .filter((m) => m.septId === septId)
    .sort((a, b) => a.scheduledAt - b.scheduledAt);
}

/**
 * Return the sept's current in-session moot, if any. Only one moot per
 * sept may be in phase opening-howl..revel at a time. Returns null when
 * the sept has only scheduled or closed moots.
 */
export async function findOpenMootForSept(septId: string): Promise<IMoot | null> {
  const all = await db.find({});
  return all.find(
    (m) =>
      m.septId === septId &&
      m.phase !== "scheduled" &&
      m.phase !== "closed",
  ) ?? null;
}

/** All currently open moots across every sept (info / +moot list). */
export async function findAllOpenMoots(): Promise<IMoot[]> {
  const all = await db.find({});
  return all
    .filter((m) => m.phase !== "scheduled" && m.phase !== "closed")
    .sort((a, b) => (a.openedAt ?? a.scheduledAt) - (b.openedAt ?? b.scheduledAt));
}

/**
 * Resolve the active moot in the room the caller is standing in. The
 * room must be bound to a caern, and the caern's sept must have an open
 * moot. Returns null when any link is missing.
 */
export async function findActiveMootForCaernRoom(
  roomId: string,
): Promise<IMoot | null> {
  const caern = await findCaernByRoom(roomId);
  if (!caern) return null;
  const sept = await findSeptByCaern(caern.id);
  if (!sept) return null;
  return findOpenMootForSept(sept.id);
}

/**
 * Resolve the sept for the room the caller is standing in via the caern
 * binding. Returns { sept, caern } so callers can render both names.
 */
export async function septForCaernRoom(
  roomId: string,
): Promise<{ septId: string; caernName: string } | null> {
  const caern = await findCaernByRoom(roomId);
  if (!caern) return null;
  const sept = await findSeptByCaern(caern.id);
  if (!sept) return null;
  return { septId: sept.id, caernName: caern.name };
}

/** Re-export for completeness; some callers want it from the same module. */
export { findCaernById };

export async function saveMoot(moot: IMoot): Promise<void> {
  moot.updatedAt = Date.now();
  await db.modify({ id: moot.id }, "$set", {
    septId: moot.septId,
    scheduledAt: moot.scheduledAt,
    openedAt: moot.openedAt,
    closedAt: moot.closedAt,
    phase: moot.phase,
    attendees: moot.attendees,
    renownAwards: moot.renownAwards,
    notes: moot.notes,
    updatedAt: moot.updatedAt,
  } as Partial<IMoot>);
}

export async function deleteMoot(id: string): Promise<void> {
  await db.delete({ id });
}
