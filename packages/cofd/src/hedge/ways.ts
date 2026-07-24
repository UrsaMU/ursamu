// Hedgeway DBO CRUD and open/close lifecycle.

import { DBO } from "@ursamu/ursamu";
import type { HedgeConfig, Hedgeway, HedgewayState } from "./types.ts";
import {
  HEDGE_CONFIG_ID,
  HEDGE_TURN_MS,
} from "./types.ts";

// deno-lint-ignore no-explicit-any
type Q = any;

export const hedgewayDb = new DBO<Hedgeway>("cofd.hedgeways");
export const hedgeConfigDb = new DBO<HedgeConfig>("cofd.hedge_config");

export async function getSeason(): Promise<string> {
  const c = await hedgeConfigDb.findOne(
    { id: HEDGE_CONFIG_ID } as Q,
  );
  return c?.season ?? "unset";
}

export async function setSeason(
  season: string,
  by: string,
): Promise<HedgeConfig> {
  const now = Date.now();
  const label = season.trim().slice(0, 64) || "unset";
  const existing = await hedgeConfigDb.findOne(
    { id: HEDGE_CONFIG_ID } as Q,
  );
  const cfg: HedgeConfig = {
    id: HEDGE_CONFIG_ID,
    season: label,
    updatedAt: now,
    updatedBy: by,
  };
  if (existing) {
    await hedgeConfigDb.atomicModify(HEDGE_CONFIG_ID, () => cfg);
  } else {
    await hedgeConfigDb.create(cfg);
  }
  return cfg;
}

export async function createHedgeway(
  name: string,
  mortalRoomId: string,
  hedgeRoomId: string,
  createdBy: string,
  keyPhrase?: string,
  maskName?: string,
): Promise<Hedgeway> {
  const now = Date.now();
  const way: Hedgeway = {
    id: `way-${now}-${Math.floor(Math.random() * 1e6)}`,
    name: name.trim().slice(0, 48),
    maskName: maskName?.trim().slice(0, 48) ||
      "Strange passage",
    mortalRoomId,
    hedgeRoomId,
    keyPhrase: keyPhrase?.trim().slice(0, 80) || undefined,
    state: "closed",
    createdBy,
    createdAt: now,
  };
  await hedgewayDb.create(way);
  return way;
}

/** Patch mutable hedgeway fields (builder). */
export async function updateHedgeway(
  way: Hedgeway,
  patch: Partial<
    Pick<Hedgeway, "name" | "maskName" | "keyPhrase">
  >,
): Promise<Hedgeway> {
  const next: Hedgeway = { ...way, ...patch };
  if (patch.name !== undefined) {
    next.name = String(patch.name).trim().slice(0, 48);
  }
  if (patch.maskName !== undefined) {
    const m = String(patch.maskName).trim().slice(0, 48);
    next.maskName = m || "Strange passage";
  }
  if (patch.keyPhrase !== undefined) {
    const k = String(patch.keyPhrase).trim().slice(0, 80);
    next.keyPhrase = k || undefined;
  }
  await hedgewayDb.atomicModify(way.id, () => next);
  return next;
}

export async function findHedgewayById(
  id: string,
): Promise<Hedgeway | null> {
  return (await hedgewayDb.findOne({ id } as Q)) ?? null;
}

export async function findHedgewayByName(
  name: string,
): Promise<Hedgeway | null> {
  const n = name.trim().toLowerCase();
  // deno-lint-ignore no-explicit-any
  const all = await hedgewayDb.find({} as any);
  return all.find((w) => w.name.toLowerCase() === n) ?? null;
}

export async function listHedgeways(): Promise<Hedgeway[]> {
  // deno-lint-ignore no-explicit-any
  return await hedgewayDb.find({} as any);
}

/** Ways touching a room (mortal or hedge side). */
export async function waysForRoom(
  roomId: string,
): Promise<Hedgeway[]> {
  // deno-lint-ignore no-explicit-any
  const all = await hedgewayDb.find({} as any);
  return all.filter(
    (w) =>
      w.mortalRoomId === roomId || w.hedgeRoomId === roomId,
  );
}

export async function destroyHedgeway(
  id: string,
): Promise<void> {
  await hedgewayDb.delete({ id } as Q);
}

/**
 * Refresh open→dormant when timer elapsed. Mutates and persists if needed.
 */
export async function refreshHedgeway(
  way: Hedgeway,
  now: number = Date.now(),
): Promise<Hedgeway> {
  if (
    way.state === "open" &&
    typeof way.openUntil === "number" &&
    now >= way.openUntil
  ) {
    const next: Hedgeway = {
      ...way,
      state: "dormant",
      openUntil: undefined,
    };
    await hedgewayDb.atomicModify(way.id, () => next);
    return next;
  }
  return way;
}

export async function openHedgeway(
  way: Hedgeway,
  openedBy: string,
  wyrd: number,
  season: string,
  now: number = Date.now(),
): Promise<Hedgeway> {
  const turns = Math.max(1, Math.floor(wyrd));
  const next: Hedgeway = {
    ...way,
    state: "open",
    openUntil: now + turns * HEDGE_TURN_MS,
    openedBy,
    seasonStamp: season,
  };
  await hedgewayDb.atomicModify(way.id, () => next);
  return next;
}

/** Whether a changeling may use this way without Glamour. */
export function freeOpenForLost(
  way: Hedgeway,
  season: string,
): boolean {
  if (way.state === "open") return true;
  if (way.state !== "dormant") return false;
  return !!way.seasonStamp && way.seasonStamp === season;
}

export function otherSideRoom(
  way: Hedgeway,
  fromRoomId: string,
): string | null {
  if (way.mortalRoomId === fromRoomId) return way.hedgeRoomId;
  if (way.hedgeRoomId === fromRoomId) return way.mortalRoomId;
  return null;
}

export function wayStateLabel(state: HedgewayState): string {
  if (state === "open") return "open";
  if (state === "dormant") return "dormant";
  return "closed";
}
