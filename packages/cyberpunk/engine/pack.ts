/**
 * Cyberpunk RED -- Nomad Pack Support Utilities
 * Pure functions for the Moto role ability's non-vehicle mechanics.
 */

export type PackRequestType = "supplies" | "backup" | "medical" | "haven";

export const PACK_REQUEST_TYPES: readonly PackRequestType[] = [
  "supplies", "backup", "medical", "haven",
];

/** 24-hour cooldown between pack requests of the same type. */
export const PACK_COOLDOWN_MS = 24 * 60 * 60 * 1_000;

/** Minimum role rank required for each request type. */
export const PACK_MIN_RANK: Record<PackRequestType, number> = {
  supplies: 1,
  backup:   4,
  medical:  4,
  haven:    7,
};

/** True if the given pack request type is currently on cooldown. */
export const isPackOnCooldown = (
  lastUsed: number | undefined,
  now = Date.now(),
): boolean => lastUsed !== undefined && now - lastUsed < PACK_COOLDOWN_MS;

/** Milliseconds remaining on a pack request cooldown (0 if expired). */
export const packCooldownRemaining = (
  lastUsed: number,
  now = Date.now(),
): number => Math.max(0, PACK_COOLDOWN_MS - (now - lastUsed));

/** True if the character's rank meets the minimum for the given request type. */
export const canRequestPack = (rank: number, type: PackRequestType): boolean =>
  rank >= PACK_MIN_RANK[type];
