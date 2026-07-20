// Shared helpers for +hedge command.

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  migrateSheet,
  type CofdSheet,
} from "../stats/index.ts";
import {
  hollowHas,
  isHollowOwner,
  parseHedgeRoom,
  type HedgeRoom,
  type Hedgeway,
} from "../hedge/index.ts";
import { addCondition } from "../subsystems/conditions.ts";
import { resolveWayName } from "../support/perception.ts";

export function getSheet(
  obj: { state?: Record<string, unknown> },
): CofdSheet | null {
  const raw = obj.state?.cofd;
  if (!raw || typeof raw !== "object") return null;
  return migrateSheet(raw);
}

export function isStaff(actor: IDBObj): boolean {
  const f = actor.flags as Set<string> | undefined;
  if (!f) return false;
  return f.has("admin") || f.has("builder") ||
    f.has("wizard") || f.has("superuser");
}

export function isBuilder(actor: IDBObj): boolean {
  return isStaff(actor);
}

export function roomHedge(
  room: { state?: Record<string, unknown> },
): HedgeRoom | null {
  return parseHedgeRoom(room.state?.hedge);
}

export async function loadRoom(
  u: IUrsamuSDK,
  roomId: string,
): Promise<IDBObj | null> {
  const rows = await u.db.search({ id: roomId });
  return (rows[0] as IDBObj | undefined) ?? null;
}

export async function persistSheet(
  u: IUrsamuSDK,
  actorId: string,
  sheet: CofdSheet,
): Promise<void> {
  await u.db.modify(actorId, "$set", { "data.cofd": sheet });
}

export async function persistRoomHedge(
  u: IUrsamuSDK,
  roomId: string,
  hedge: HedgeRoom,
): Promise<void> {
  await u.db.modify(roomId, "$set", { "data.hedge": hedge });
}

/**
 * Hob Alarm (Hollow enhancement): non-owners who enter
 * trigger a room-wide ST cue and optional Spooked.
 * Does not spawn NPCs — staff begin the encounter.
 */
export async function checkHobAlarmOnEnter(
  u: IUrsamuSDK,
  destRoomId: string,
  actorId: string,
): Promise<void> {
  // Player self-move only (skip NPC/zone synthetic moves).
  if (!u.me?.id || actorId !== u.me.id) return;

  const room = await loadRoom(u, destRoomId);
  if (!room) return;
  const hr = roomHedge(room);
  if (!hr || hr.realm !== "hollow") return;
  if (!hollowHas(hr, "hob-alarm")) return;
  if (isHollowOwner(hr, actorId)) return;

  const msg =
    "The Hob Alarm triggers! (ST: begin combat encounter)";
  u.send(msg);
  try {
    u.broadcast?.(msg);
  } catch {
    // broadcast optional on some SDK shims
  }
  if (typeof u.here?.broadcast === "function") {
    try {
      u.here.broadcast(msg);
    } catch {
      // ignore
    }
  }

  const sheet = getSheet(u.me);
  if (!sheet) return;
  const next = addCondition(sheet, "spooked");
  if (next === sheet) return;
  await persistSheet(u, actorId, next);
  u.send("You gain the Spooked Condition.");
}

/** Move actor to room (same path as zone wander). */
export async function moveActor(
  u: IUrsamuSDK,
  actorId: string,
  roomId: string,
): Promise<void> {
  await u.db.modify(actorId, "$set", {
    "data.location": roomId,
    location: roomId,
  });
  await checkHobAlarmOnEnter(u, roomId, actorId);
}

export function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

/** Gate line for +hedge list/status (dual name by looker). */
export function wayLine(
  w: Hedgeway,
  looker?: IDBObj | null,
): string {
  const label = looker
    ? resolveWayName(looker, w)
    : w.name;
  const open = w.state === "open" && w.openUntil
    ? ` until ${
      new Date(w.openUntil).toISOString().slice(11, 19)
    }Z`
    : "";
  return `  ${pad(label, 18)} ${pad(w.state, 8)}${open}  ` +
    `${w.mortalRoomId} ↔ ${w.hedgeRoomId}`;
}
