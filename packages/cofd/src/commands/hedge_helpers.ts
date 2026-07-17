// Shared helpers for +hedge command.

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  migrateSheet,
  type CofdSheet,
} from "../stats/index.ts";
import {
  parseHedgeRoom,
  type HedgeRoom,
  type Hedgeway,
} from "../hedge/index.ts";
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
