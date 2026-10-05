// Hollow enhancement mechanics: Hidden Entry, Shadow Garden.

import type { HedgeRoom } from "./types.ts";
import { hollowHas, isHollowOwner } from "./hollow.ts";

export interface ShadowPending {
  slug: string;
  eatenAt: number;
  /** Ready after this epoch. */
  readyAt: number;
}

const SHADOW_MS = 3600_000; // 1 hour

/** True when Hidden Entry should hide the gate (all owners inside). */
export function hiddenEntryActive(
  room: HedgeRoom | null,
  occupantIds: string[],
): boolean {
  if (!room || room.realm !== "hollow" || !room.hollow) {
    return false;
  }
  if (!hollowHas(room, "hidden-entry")) return false;
  const owners = room.hollow.owners;
  if (!owners.length) return false;
  const inside = new Set(occupantIds);
  return owners.every((id) => inside.has(id));
}

/** Dice penalty to find/force a hidden Hollow entrance. */
export function hiddenEntryPenalty(
  room: HedgeRoom | null,
  occupantIds: string[],
): number {
  return hiddenEntryActive(room, occupantIds) ? 2 : 0;
}

export function readShadowPending(
  room: HedgeRoom | null,
): ShadowPending[] {
  const raw = (room?.hollow as { shadowPending?: unknown } | undefined)
    ?.shadowPending;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        slug: String(o.slug ?? ""),
        eatenAt: Number(o.eatenAt) || 0,
        readyAt: Number(o.readyAt) || 0,
      };
    })
    .filter((p) => p.slug);
}

export function writeShadowPending(
  room: HedgeRoom,
  pending: ShadowPending[],
): HedgeRoom {
  if (!room.hollow) return room;
  return {
    ...room,
    hollow: {
      ...room.hollow,
      // store extra field
      ...{ shadowPending: pending },
    },
  };
}

/** Queue a shadow fruit after eat in a Shadow Garden Hollow. */
export function queueShadowFruit(
  room: HedgeRoom,
  slug: string,
  now: number = Date.now(),
): HedgeRoom | null {
  if (!hollowHas(room, "shadow-garden")) return null;
  const pending = [
    ...readShadowPending(room),
    {
      slug,
      eatenAt: now,
      readyAt: now + SHADOW_MS,
    },
  ];
  return writeShadowPending(room, pending);
}

/** Fruits ready to harvest from the garden. */
export function readyShadowFruit(
  room: HedgeRoom | null,
  now: number = Date.now(),
): { ready: ShadowPending[]; remaining: ShadowPending[] } {
  const all = readShadowPending(room);
  const ready = all.filter((p) => p.readyAt <= now);
  const remaining = all.filter((p) => p.readyAt > now);
  return { ready, remaining };
}

export function isHollowOwnerId(
  room: HedgeRoom | null,
  actorId: string,
): boolean {
  return isHollowOwner(room, actorId);
}
