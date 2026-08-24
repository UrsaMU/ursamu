/**
 * Dungeon/camp skins for procedural runs.
 */
import type { DungeonSkin } from "./types.ts";
import skinsJson from "../../resources/dungeon-skins.json" with {
  type: "json",
};

export const DUNGEON_SKINS: Record<string, DungeonSkin> =
  skinsJson as unknown as Record<string, DungeonSkin>;

export function skinBySlug(raw: string): DungeonSkin | undefined {
  const t = raw.toLowerCase().trim().replace(/\s+/g, "-");
  return DUNGEON_SKINS[t] ??
    Object.values(DUNGEON_SKINS).find((s) =>
      s.name.toLowerCase() === raw.toLowerCase()
    );
}

export function listSkins(): DungeonSkin[] {
  return Object.values(DUNGEON_SKINS).sort((a, b) =>
    a.tier - b.tier || a.name.localeCompare(b.name)
  );
}
