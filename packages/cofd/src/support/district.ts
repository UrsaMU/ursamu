// Support for CofD district traits and parent inheritance.
// Adapted from Damnation City (NWoD) to Chronicles of Darkness (CofD).

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

export interface SafehouseLimits {
  sizeMax?: number;
  securityMin?: number;
  locationMin?: number;
}

export interface DistrictTraits {
  type: string;
  access: number;
  safety: number;
  information: number;
  awareness: number;
  prestige: number;
  stability: number;
  safehouseLimits: SafehouseLimits;
}

export const DEFAULT_ARCHETYPES: Record<
  string,
  Omit<DistrictTraits, "type">
> = {
  airport: {
    access: 3,
    safety: 2,
    information: 2,
    awareness: 2,
    prestige: -1,
    stability: 2,
    safehouseLimits: { sizeMax: 2 },
  },
  asylum: {
    access: -2,
    safety: 1,
    information: -3,
    awareness: 2,
    prestige: -3,
    stability: 1,
    safehouseLimits: { securityMin: 3 },
  },
  cathedral: {
    access: 1,
    safety: 3,
    information: 1,
    awareness: 1,
    prestige: 3,
    stability: 2,
    safehouseLimits: { locationMin: 2 },
  },
  chinatown: {
    access: 1,
    safety: -1,
    information: 2,
    awareness: -1,
    prestige: 1,
    stability: 3,
    safehouseLimits: {},
  },
  corporate: {
    access: 2,
    safety: 3,
    information: 1,
    awareness: 2,
    prestige: 3,
    stability: 1,
    safehouseLimits: { sizeMax: 4, securityMin: 2 },
  },
  elysium: {
    access: 2,
    safety: 4,
    information: 2,
    awareness: 3,
    prestige: 4,
    stability: 3,
    safehouseLimits: { securityMin: 3, locationMin: 3 },
  },
  financial: {
    access: 2,
    safety: 1,
    information: 3,
    awareness: 1,
    prestige: 3,
    stability: 1,
    safehouseLimits: {},
  },
  industrial: {
    access: 1,
    safety: -2,
    information: -2,
    awareness: -2,
    prestige: -2,
    stability: -1,
    safehouseLimits: { sizeMax: 5 },
  },
  projects: {
    access: 1,
    safety: -3,
    information: 1,
    awareness: -1,
    prestige: -4,
    stability: 2,
    safehouseLimits: { sizeMax: 2 },
  },
  sewers: {
    access: -4,
    safety: -4,
    information: -4,
    awareness: -3,
    prestige: -5,
    stability: -4,
    safehouseLimits: { sizeMax: 1 },
  },
  slums: {
    access: 1,
    safety: -3,
    information: 1,
    awareness: -2,
    prestige: -3,
    stability: 1,
    safehouseLimits: { sizeMax: 3 },
  },
  university: {
    access: 3,
    safety: 2,
    information: 3,
    awareness: 1,
    prestige: 2,
    stability: 2,
    safehouseLimits: {},
  },
};

/**
 * Resolves the district traits of a room.
 * Traverses `@parent` recursively if not defined directly on the room.
 */
export async function resolveDistrictTraits(
  u: IUrsamuSDK,
  roomId: string,
): Promise<DistrictTraits | null> {
  let currentId = roomId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const results = await u.db.search({ id: currentId });
    const obj = results[0];
    if (!obj) break;

    // Check if district traits are set in state
    // deno-lint-ignore no-explicit-any
    const traits = obj.state?.district_traits as any;
    if (traits) {
      return {
        type: traits.type ?? "Custom",
        access: traits.access ?? 0,
        safety: traits.safety ?? 0,
        information: traits.information ?? 0,
        awareness: traits.awareness ?? 0,
        prestige: traits.prestige ?? 0,
        stability: traits.stability ?? 0,
        safehouseLimits: traits.safehouseLimits ?? {},
      };
    }

    currentId = obj.state?.parent as string;
  }

  return null;
}
