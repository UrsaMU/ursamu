// Shared +views helpers (place resolve, lock check, storage).

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  getRoomViews,
  type RoomView,
  type RoomViews,
} from "../views/index.ts";

export type Place = {
  state: { room_views?: RoomViews; [k: string]: unknown };
  id: string;
  name?: string;
  flags: Set<string>;
};

export async function resolvePlace(
  u: IUrsamuSDK,
  who: string,
): Promise<Place | null> {
  if (!who || who.toLowerCase() === "here") {
    return u.here as unknown as Place;
  }
  const t = await u.util.target(u.me, who, true);
  return (t as unknown as Place) ?? null;
}

export async function canSeeView(
  u: IUrsamuSDK,
  place: Place,
  view: RoomView,
): Promise<boolean> {
  const lock = (view.lock ?? "").trim();
  if (!lock) return true;
  try {
    return await u.checkLock(place as never, lock);
  } catch {
    return false;
  }
}

export async function visibleViews(
  u: IUrsamuSDK,
  place: Place,
): Promise<RoomView[]> {
  const all = Object.values(getRoomViews(place));
  const out: RoomView[] = [];
  for (const v of all) {
    if (await canSeeView(u, place, v)) out.push(v);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function writeViews(
  u: IUrsamuSDK,
  place: Place,
  views: RoomViews,
): Promise<void> {
  await u.db.modify(place.id, "$set", { "data.room_views": views });
}

export async function requirePlaceEdit(
  u: IUrsamuSDK,
  place: Place,
): Promise<boolean> {
  if (await u.canEdit(u.me as never, place as never)) return true;
  u.send("Permission denied.");
  return false;
}

export function splitOnFirst(
  raw: string,
  sep: string,
): { left: string; right: string } | null {
  const i = raw.indexOf(sep);
  if (i < 0) return null;
  return { left: raw.slice(0, i).trim(), right: raw.slice(i + 1).trim() };
}
