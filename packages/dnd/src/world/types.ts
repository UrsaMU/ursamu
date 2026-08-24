/** Starter-world / town seed JSON shapes. */

export interface WorldRoomDef {
  key: string;
  name: string;
  description: string;
}

export interface WorldExitDef {
  from: string;
  to: string;
  name: string;
}

export interface WorldVendorDef {
  room: string;
  name: string;
  description?: string;
  inventory: Array<{
    name: string;
    price: number;
    spec: string;
  }>;
}

export interface WorldNpcDef {
  room: string;
  name: string;
  template: string;
}

/** One tile on the procedural map, relative to town origin. */
export interface MapTileDef {
  /** Matches a room key (for dock / goto). */
  key: string;
  dx: number;
  dy: number;
  /** Optional z offset (default 0). */
  dz?: number;
  /** Single Latin-1 glyph for the minimap. */
  glyph: string;
  /** infrastructure | landmark | hazard | cache | faction */
  kind: string;
  /** Override display name (default: room name). */
  name?: string;
  blocksMovement?: boolean;
}

export interface TownMapDef {
  /** Map realm id (default "default"). */
  realm?: string;
  origin: { x: number; y: number; z?: number };
  faction?: string;
  tiles: MapTileDef[];
  notes?: string;
}

/**
 * Full town definition: rooms + exits + actors + optional map.
 * Starter world is one town; more can live under resources/towns/.
 */
export interface TownDef {
  id: string;
  name: string;
  playerStartKey: string;
  linkOoc?: boolean;
  rooms: WorldRoomDef[];
  exits: WorldExitDef[];
  vendors?: WorldVendorDef[];
  npcs?: WorldNpcDef[];
  map?: TownMapDef;
}

/** @deprecated alias — starter world is a TownDef. */
export type StarterWorldDef = TownDef;

export interface MapTileRecord {
  key: string;
  x: number;
  y: number;
  z: number;
  realm: string;
  roomId?: string;
  glyph: string;
  kind: string;
}

export interface SeedRecord {
  id: string;
  worldId: string;
  at: number;
  /** room key → object id */
  rooms: Record<string, string>;
  vendors: string[];
  npcs: string[];
  playerStart?: string;
  /** Map overlay placement when @ursamu/map-plugin was present. */
  map?: {
    realm: string;
    origin: { x: number; y: number; z: number };
    tiles: MapTileRecord[];
    skipped?: string;
  };
}
