/**
 * Optional @ursamu/map-plugin integration: seed town tiles
 * as infrastructure overlays. Soft-import — no hard dep.
 */
import type {
  MapTileRecord,
  TownDef,
  TownMapDef,
} from "./types.ts";

export type MapApi = {
  setOverlay: (o: {
    key?: string;
    x: number;
    y: number;
    z: number;
    realm?: string;
    glyph?: string;
    name?: string;
    kind?: string;
    faction?: string;
    desc?: string;
    blocksMovement?: boolean;
  }) => Promise<void>;
};

/** Resolve local monorepo or installed map plugin. */
export async function loadMapApi(): Promise<MapApi | null> {
  const paths = [
    "@ursamu/map-plugin",
    "../../../map/index.ts",
    "../../map/index.ts",
  ];
  for (const p of paths) {
    try {
      const mod = await import(p);
      if (typeof mod.setOverlay === "function") {
        return { setOverlay: mod.setOverlay };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export function validateTownMap(
  town: TownDef,
): string[] {
  const errs: string[] = [];
  const m = town.map;
  if (!m) return errs;
  const keys = new Set(town.rooms.map((r) => r.key));
  if (!Number.isInteger(m.origin.x) || !Number.isInteger(m.origin.y)) {
    errs.push("map.origin x/y must be integers");
  }
  const seen = new Set<string>();
  for (const t of m.tiles) {
    if (!keys.has(t.key)) {
      errs.push(`map tile unknown room key: ${t.key}`);
    }
    if (!t.glyph || t.glyph.length !== 1) {
      errs.push(`map tile ${t.key}: glyph must be 1 char`);
    }
    const ck = `${t.dx},${t.dy},${t.dz ?? 0}`;
    if (seen.has(ck)) errs.push(`map duplicate offset ${ck}`);
    seen.add(ck);
  }
  return errs;
}

export function resolveMapTiles(
  town: TownDef,
  roomIds: Record<string, string>,
): MapTileRecord[] {
  const m = town.map;
  if (!m) return [];
  const realm = m.realm?.trim() || "default";
  const oz = m.origin.z ?? 0;
  return m.tiles.map((t) => ({
    key: t.key,
    x: m.origin.x + t.dx,
    y: m.origin.y + t.dy,
    z: oz + (t.dz ?? 0),
    realm,
    roomId: roomIds[t.key],
    glyph: t.glyph,
    kind: t.kind || "infrastructure",
  }));
}

/**
 * Write town footprint to map.overlays. Returns tiles placed
 * or a skip reason.
 */
export async function seedTownMapOverlays(
  town: TownDef,
  roomIds: Record<string, string>,
  api?: MapApi | null,
): Promise<{
  tiles: MapTileRecord[];
  skipped?: string;
  placed: number;
}> {
  const m = town.map;
  if (!m || !m.tiles.length) {
    return { tiles: [], placed: 0, skipped: "no map section" };
  }
  const map = api === undefined ? await loadMapApi() : api;
  if (!map) {
    return {
      tiles: resolveMapTiles(town, roomIds),
      placed: 0,
      skipped: "map plugin not loaded",
    };
  }

  const realm = m.realm?.trim() || "default";
  const faction = m.faction ?? town.name;
  const byKey = new Map(town.rooms.map((r) => [r.key, r]));
  const tiles = resolveMapTiles(town, roomIds);
  let placed = 0;

  for (const t of m.tiles) {
    const room = byKey.get(t.key);
    const x = m.origin.x + t.dx;
    const y = m.origin.y + t.dy;
    const z = (m.origin.z ?? 0) + (t.dz ?? 0);
    const roomId = roomIds[t.key];
    const label = t.name ?? room?.name ?? t.key;
    const descParts = [
      room?.description?.slice(0, 120) ?? "",
      roomId ? `Dock room #${roomId}` : "",
      `key=${t.key}`,
    ].filter(Boolean);

    await map.setOverlay({
      x,
      y,
      z,
      realm,
      glyph: t.glyph,
      kind: t.kind || "infrastructure",
      name: label,
      faction,
      desc: descParts.join(" · "),
      blocksMovement: t.blocksMovement,
    });
    placed += 1;
  }

  return { tiles, placed };
}

/** Pure helper for tests / staff preview. */
export function formatMapSummary(
  town: TownDef,
  tiles: MapTileRecord[],
): string {
  const m = town.map;
  if (!m) return `${town.name}: no map footprint.`;
  const o = m.origin;
  return (
    `${town.name} @ ${m.realm ?? "default"}:` +
    `(${o.x},${o.y},${o.z ?? 0}) — ${tiles.length} tiles`
  );
}

export type { TownMapDef };
