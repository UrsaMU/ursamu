/**
 * Encounter-aware room queries for zone wander / hunter pathing.
 */

import type { Encounter } from "./types.ts";
import {
  getEncounterStore,
  type EncounterStore,
} from "./store.ts";

export interface ZoneQueryOptions {
  store?: EncounterStore;
}

function storeOf(opts?: ZoneQueryOptions): EncounterStore {
  return opts?.store ?? getEncounterStore();
}

/** True when room has an active combat encounter. */
export async function roomHasActiveEncounter(
  roomId: string,
  opts?: ZoneQueryOptions,
): Promise<boolean> {
  const store = storeOf(opts);
  if (!store.findInRoom) return false;
  const enc = await store.findInRoom(roomId);
  return !!enc && enc.status === "active";
}

export interface ActiveEncounterHit {
  roomId: string;
  encounter: Encounter;
}

/**
 * First room in roomIds with an active encounter.
 * When requirePc is true (default), needs at least one PC participant.
 */
export async function findActiveEncounterRoom(
  roomIds: string[],
  opts?: ZoneQueryOptions & { requirePc?: boolean },
): Promise<ActiveEncounterHit | null> {
  const store = storeOf(opts);
  if (!store.findInRoom) return null;
  const requirePc = opts?.requirePc !== false;
  for (const roomId of roomIds) {
    const enc = await store.findInRoom(roomId);
    if (!enc || enc.status !== "active") continue;
    if (requirePc) {
      const hasPc = enc.participants.some((p) => p.kind === "pc");
      if (!hasPc) continue;
    }
    return { roomId, encounter: enc };
  }
  return null;
}
