// Shared contract for the map plugin. Every other module in this plugin imports
// from this file; nothing in here imports from peers, so it is the canonical
// source of types and constants.

// ─── Coordinate ───────────────────────────────────────────────────────────────

export interface Coord {
  x: number;
  y: number;
  z: number;
  /** Logical map id. Absent / empty means {@link DEFAULT_REALM}. */
  realm?: string;
}

/** Sentinel for coords with no explicit realm. */
export const DEFAULT_REALM = "default";

/** Returns the realm of a coord, normalizing missing/empty to {@link DEFAULT_REALM}. */
export const realmOf = (c: Pick<Coord, "realm">): string => {
  const r = c.realm;
  return typeof r === "string" && r.length > 0 ? r : DEFAULT_REALM;
};

export const coordKey = (c: Coord): string =>
  `${realmOf(c)}:${c.x},${c.y},${c.z}`;

// ─── Biome & legend ───────────────────────────────────────────────────────────

/** A Latin-1 single character used on the minimap. */
export type Glyph = string;

export interface BiomeDefinition {
  /** Stable id used by configs and overlays. */
  id: string;
  /** Display label, e.g. "Mudflats". */
  name: string;
  /** Single Latin-1 character drawn on the minimap. */
  glyph: Glyph;
  /** Optional MUSH color code applied to the glyph (e.g. "%cg"). */
  color?: string;
  /**
   * Briefing-style phrase fragments the renderer may weave into prose.
   * Strictly objective tone — no "you see" phrasing.
   */
  phrases: {
    /** Used when this biome dominates the centre tile. */
    self: string[];
    /** Used when this biome appears in the named cardinal neighbourhood. */
    adjacent?: string[];
  };
  /** Optional traversal cost hint for movement / vehicle rules. */
  traversal?: "trivial" | "easy" | "rough" | "hazard" | "impassable";
  /** 0..1 vision-blocking; 0 = transparent, 1 = fully blocks line-of-sight. */
  occludes?: number;
}

/** Glyph categories enforced by the renderer to keep Latin-1 consistent. */
export interface MapLegend {
  /** Traversable terrain glyphs — light punctuation. e.g. ".", ",", "~". */
  terrain: Glyph[];
  /** Infrastructure glyphs — heavy symbols. e.g. "#", "=", "+". */
  infrastructure: Glyph[];
  /** Entity glyphs — alphabetical. e.g. "@", "R", "C". */
  entities: Glyph[];
  /** Glyph rendered for fully-unseen tiles. Default `?`. */
  fog?: Glyph;
  /** Glyph rendered for memory-only (last-seen) tiles. Default `.`. */
  fogMemory?: Glyph;
}

// ─── Whittaker matrix ─────────────────────────────────────────────────────────

/**
 * Elevation / moisture both range 0..1 after octave summation + normalization.
 * A matrix entry is selected when both axes fall inside its range.
 */
export interface WhittakerCell {
  elevation: [number, number];
  moisture: [number, number];
  biome: string; // BiomeDefinition.id
}

// ─── Plugin configuration ─────────────────────────────────────────────────────

/**
 * A named region (AABB). Regions can nest via `parent`, letting consumers
 * model "Mos Eisley → Hutt Space → Lawless" without bolting metadata on
 * top of flat sectors.
 */
export interface Region {
  /** Stable slug; used as `parent` references. */
  slug: string;
  /** Display name. */
  name: string;
  /** Inclusive bounding box. */
  aabb: [Coord, Coord];
  /** Slug of the enclosing region, if any. */
  parent?: string;
  /** Free-form tags ("lawless", "spaceport"). */
  tags?: string[];
  /** Arbitrary metadata bag for sibling plugins. */
  metadata?: Record<string, unknown>;
}

export interface MapNoiseConfig {
  seed: string;
  /** World-space distance covered by one base-octave noise unit. */
  scale: number;
  /**
   * Octave weighting. Each entry is { frequency, amplitude }. Sum of
   * amplitudes is normalized internally.
   */
  octaves: { frequency: number; amplitude: number }[];
}

export interface MapConfig {
  /** Two independent seeds, offset deterministically via alea. */
  noise: {
    elevation: MapNoiseConfig;
    moisture: MapNoiseConfig;
  };
  biomes: BiomeDefinition[];
  legend: MapLegend;
  matrix: WhittakerCell[];
  /** Width of the rendered minimap in cells. Must be odd. Default 15. */
  viewportWidth?: number;
  /** Height of the rendered minimap in cells. Must be odd. Default 7. */
  viewportHeight?: number;
  /**
   * Legacy: flat AABB sectors keyed by slug. Preserved for back-compat; the
   * renderer auto-converts these into single-level Regions when `regions` is
   * not set. New consumers should prefer {@link MapConfig.regions}.
   */
  sectors?: Record<string, { name: string; aabb: [Coord, Coord] }>;
  /**
   * Nested named regions. Renderer uses {@link getRegion} to resolve the
   * deepest matching region for a coord and labels the header with the full
   * region path (deepest → outermost).
   */
  regions?: Region[];
  /** Optional hard bounds; movement + jump + setOverlay refuse outside. */
  bounds?: MapBounds;
  /** Number of seconds a memory record stays "fresh" before being considered stale. Default 3600. */
  memoryTtlSeconds?: number;
}

export interface MapBounds {
  min: Coord;
  max: Coord;
}

// ─── Tile overlay (authored / persistent state) ───────────────────────────────

/**
 * Stored only when authored content overrides procedural terrain at a coord
 * (a building, a cache, a faction marker). Absence of an overlay means
 * "use the topology engine".
 */
export interface TileOverlay {
  /** Composite key `${realm}:${x},${y},${z}` — also persisted as separate fields. */
  key: string;
  x: number;
  y: number;
  z: number;
  /** Realm this overlay belongs to. Absent/empty → {@link DEFAULT_REALM}. */
  realm?: string;
  /** Overrides the procedural biome glyph if set. */
  glyph?: Glyph;
  /** Overrides the procedural biome id if set. */
  biome?: string;
  /** Authored display name, e.g. "Forward Command Bunker". */
  name?: string;
  /** "infrastructure" | "landmark" | "hazard" | "cache" | "faction". */
  kind?: string;
  /** Faction tag rendered in brackets, e.g. "Republic". */
  faction?: string;
  /** Free-form authored description, evaluated through the format pipeline. */
  desc?: string;
  /** 0..1 vision-blocking override on top of biome. e.g. wall=1, hill=0.5. */
  occludes?: number;
  /** If true, movement commands cannot enter this tile. */
  blocksMovement?: boolean;
}

// ─── Topology engine result ───────────────────────────────────────────────────

export interface TopologySample {
  coord: Coord;
  elevation: number; // 0..1
  moisture: number;  // 0..1
  biome: BiomeDefinition;
}

export interface NeighborhoodSample {
  centre: TopologySample;
  /** 8 Moore-neighborhood samples keyed by cardinal/ordinal direction. */
  ring: {
    N: TopologySample; NE: TopologySample; E: TopologySample; SE: TopologySample;
    S: TopologySample; SW: TopologySample; W: TopologySample; NW: TopologySample;
  };
}

// ─── Renderer input ───────────────────────────────────────────────────────────

export interface EntityMarker {
  glyph: Glyph;
  /** Player or NPC display name. */
  name: string;
  faction?: string;
  /** Optional flavor: "operating in an AT-RT Walker", "advancing through brush". */
  status?: string;
  /** Used for aggregation when many identical NPCs share a tile. */
  groupKey?: string;
}

export interface RenderTile {
  coord: Coord;
  glyph: Glyph;
  /** True if an overlay placed something on this tile. */
  authored: boolean;
}

export interface RenderInput {
  sectorTitle: string;
  centre: Coord;
  /** 2D grid sized viewportHeight x viewportWidth. */
  tiles: RenderTile[][];
  /** Topology of the centre tile + its Moore neighborhood. */
  neighborhood: NeighborhoodSample;
  /** Authored overlays present within the viewport. */
  overlays: TileOverlay[];
  /** Entities (players + NPCs) currently within the viewport. */
  entities: EntityMarker[];
  /** Cardinal label hints for the "ADJACENT SECTORS" footer. */
  adjacency: { N: string; S: string; E: string; W: string };
  /**
   * Optional fog-of-war mask. If omitted, the renderer draws everything live
   * (back-compat with no-fog callers). If present, tiles outside `live` and
   * `memory` are rendered as the legend's `fog` glyph, memory-only tiles as
   * `fogMemory`, and entities not at live-visible coords are dropped.
   */
  visibility?: VisibilityMask;
  /** True when the caller is an admin spectator — renders an indicator. */
  spectator?: boolean;
  /** Optional info lines appended below "ADJACENT SECTORS" by extension API. */
  infoLines?: string[];
}

// ─── Map entity & fog-of-war contracts ────────────────────────────────────────

/**
 * A piece on the map. Players never carry a coord; entities do. Players ride
 * entities via `containerId` (containment model — they're inside the cockpit)
 * or command them remotely via `controllerId` (link model — for scouts /
 * structures the player operates from elsewhere).
 */
export interface MapEntity {
  id: string;
  coord: Coord;
  glyph: Glyph;
  /** Free-form category: "vehicle" | "squad" | "scout" | "structure" | ... */
  kind: string;
  /** Factions share vision via the union of their entities' live FoV. */
  factionId?: string;
  /** dbref of the UrsaMU object the entity inhabits — cockpit / vehicle. */
  containerId?: string;
  /** dbref of the player who commands this entity remotely (link model). */
  controllerId?: string;
  /** Display name shown in contacts sections + spectate output. */
  name: string;
  /** Optional one-line status string. */
  status?: string;
  /** Tiles of Chebyshev sight radius. 0 means blind. */
  vision: number;
  /** When true, entity does not appear in others' live vision. */
  hidden?: boolean;
  /** Real-room dbref where this entity docks when landed; empty while in-map. */
  lastDock?: string;
}

/** DBO collection holding MapEntity records. */
export const ENTITY_COLLECTION = "map.entities";

/**
 * Last-seen memory of a tile, keyed per faction (or per controller for
 * factionless entities). Renderer overlays these onto tiles outside the
 * live-visible set.
 */
export interface FogRecord {
  /** Composite key `${ownerId}|${realm}:${x},${y},${z}`. */
  key: string;
  /** factionId or controllerId — whatever owns this memory. */
  ownerId: string;
  /** Realm this memory belongs to. Absent → {@link DEFAULT_REALM}. */
  realm?: string;
  x: number;
  y: number;
  z: number;
  /** Glyph at the moment the tile was last seen. */
  glyph: Glyph;
  /** Optional categorical hint (biome id, overlay kind). */
  kind?: string;
  /** Optional last-seen name (e.g., overlay name). */
  name?: string;
  /** ms since epoch when the memory was written. */
  lastSeenAt: number;
}

/** DBO collection holding FogRecord rows. */
export const FOG_COLLECTION = "map.fog";

/**
 * Per-render visibility set. `live` is what the viewer can see RIGHT NOW;
 * `memory` is the union of memory records for tiles the viewer has seen
 * before but cannot see now. Keys are `coordKey(...)` strings.
 */
export interface VisibilityMask {
  live: Set<string>;
  memory: Map<string, FogRecord>;
}

/** Object flag a builder sets on a vehicle / squad / structure to mark it
 *  as eligible to host a `MapEntity`. The presence of this flag on
 *  `u.me.location` is the primary "passenger" gate. */
export const MAP_CAPABLE_FLAG = "map-capable";

/** Player state field for the link model. Points at a `MapEntity.id`. */
export const CONTROLLING_STATE_FIELD = "mapControlling";

/** Player state field for admin spectate. Points at a `MapEntity.id`. */
export const SPECTATING_STATE_FIELD = "mapSpectating";

/** Hard cap on `MapEntity.vision`. */
export const MAX_VISION = 30;

/** Default memory record TTL in seconds (1 hour). */
export const DEFAULT_MEMORY_TTL_SECONDS = 3600;

// ─── Renderer output constants ────────────────────────────────────────────────

export const VIEWPORT_COLS = 78;
export const MAX_VIEWPORT_LINES = 28;
export const DEFAULT_MINIMAP_W = 15;
export const DEFAULT_MINIMAP_H = 7;

// ─── DBO collection name ──────────────────────────────────────────────────────

/** Plugin DBO collection holding TileOverlay records. */
export const OVERLAY_COLLECTION = "map.overlays";

/**
 * Returns true iff `target` should be visible to `viewer` ignoring fog —
 * i.e., they're on the same faction OR target isn't hidden.
 */
export function isEntityVisibleTo(
  target: Pick<MapEntity, "hidden" | "factionId">,
  viewer: Pick<MapEntity, "factionId">,
): boolean {
  if (!target.hidden) return true;
  if (!target.factionId) return false;
  return target.factionId === viewer.factionId;
}
