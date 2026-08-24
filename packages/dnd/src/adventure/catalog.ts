/**
 * Adventure + treasure JSON loaders.
 */
import type { AdventureDef, TreasureTable } from "./types.ts";
import adventuresJson from "../../resources/adventures.json" with {
  type: "json",
};
import treasureJson from "../../resources/treasure.json" with {
  type: "json",
};

export const ADVENTURES: Record<string, AdventureDef> =
  adventuresJson as Record<string, AdventureDef>;

export const TREASURE: Record<string, TreasureTable> =
  treasureJson as Record<string, TreasureTable>;

export function adventureBySlug(
  raw: string,
): AdventureDef | undefined {
  const t = raw.toLowerCase().trim().replace(/\s+/g, "-");
  return ADVENTURES[t] ??
    Object.values(ADVENTURES).find((a) =>
      a.name.toLowerCase() === raw.toLowerCase()
    );
}

export function treasureBySlug(
  raw: string,
): TreasureTable | undefined {
  const t = raw.toLowerCase().trim().replace(/\s+/g, "-");
  return TREASURE[t];
}

export function listAdventures(): AdventureDef[] {
  return Object.values(ADVENTURES).sort((a, b) =>
    a.tier - b.tier || a.name.localeCompare(b.name)
  );
}
