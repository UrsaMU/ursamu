// Dread Powers / Numina catalog. Typed loader over resources/dread_powers.json.

import dreadPowersData from "../../resources/dread_powers.json" with {
  type: "json",
};
import { NPC_TIERS, type NpcTier } from "./archetypes.ts";

export type DreadKind = "dread" | "numen";

export interface DreadPower {
  key: string;
  label: string;
  kind: DreadKind;
  tierMin: NpcTier;
  cost: string;
  pool: string;
  description: string;
}

const ALL: DreadPower[] = (dreadPowersData as DreadPower[]).map((p) => ({
  ...p,
  key: p.key.toLowerCase(),
}));

const BY_KEY: Map<string, DreadPower> = new Map(ALL.map((p) => [p.key, p]));

/** All known dread powers, sorted alphabetically. */
export function listDreadPowers(): DreadPower[] {
  return [...ALL].sort((a, b) => a.label.localeCompare(b.label));
}

/** Look up a dread power by key (case-insensitive). */
export function getDreadPower(key: string): DreadPower | null {
  return BY_KEY.get(key.toLowerCase().trim()) ?? null;
}

/** Return true if `tier` meets the power's tier-min requirement. */
export function tierMeetsPower(tier: NpcTier, p: DreadPower): boolean {
  return NPC_TIERS.indexOf(tier) >= NPC_TIERS.indexOf(p.tierMin);
}
