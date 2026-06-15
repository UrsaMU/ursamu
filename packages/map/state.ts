import { DBO } from "ursamu";
import type { IUrsamuSDK } from "ursamu";
import {
  type Coord,
  coordKey,
  OVERLAY_COLLECTION,
  realmOf,
  type TileOverlay,
} from "./schemas.ts";

type StoredOverlay = TileOverlay & { id: string };

const overlays = new DBO<StoredOverlay>(OVERLAY_COLLECTION);

const stripId = (rec: StoredOverlay): TileOverlay => {
  const { id: _id, ...rest } = rec;
  return rest;
};

export const getOverlay = async (coord: Coord): Promise<TileOverlay | null> => {
  const key = coordKey(coord);
  const rec = await overlays.findOne({ key });
  return rec ? stripId(rec) : null;
};

export const getOverlaysInRegion = async (
  min: Coord,
  max: Coord,
): Promise<TileOverlay[]> => {
  const xLo = Math.min(min.x, max.x);
  const xHi = Math.max(min.x, max.x);
  const yLo = Math.min(min.y, max.y);
  const yHi = Math.max(min.y, max.y);
  const zLo = Math.min(min.z, max.z);
  const zHi = Math.max(min.z, max.z);

  const span = (xHi - xLo + 1) * (yHi - yLo + 1) * (zHi - zLo + 1);
  if (span > REGION_MAX_TILES) {
    throw new Error("getOverlaysInRegion: region too large");
  }
  const realm = realmOf(min);
  const all = await overlays.all();
  return all
    .filter((o) =>
      realmOf(o) === realm &&
      o.x >= xLo && o.x <= xHi &&
      o.y >= yLo && o.y <= yHi &&
      o.z >= zLo && o.z <= zHi
    )
    .map(stripId);
};

const REGION_MAX_TILES = 4096;

export const setOverlay = async (overlay: TileOverlay): Promise<void> => {
  if (!validateOverlay(overlay)) {
    throw new Error("setOverlay: invalid overlay payload");
  }
  const realm = realmOf(overlay);
  const key = coordKey({ x: overlay.x, y: overlay.y, z: overlay.z, realm });
  const record: StoredOverlay = { ...overlay, realm, key, id: key };
  await overlays.update({ id: key }, record);
};

export const clearOverlay = async (coord: Coord): Promise<void> => {
  const key = coordKey(coord);
  await overlays.delete({ id: key });
};

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export const getPlayerCoord = (
  playerState: Record<string, unknown>,
): Coord | null => {
  const coord = playerState?.coord;
  if (!coord || typeof coord !== "object") return null;
  const { x, y, z, realm } = coord as Record<string, unknown>;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    return null;
  }
  const out: Coord = { x, y, z };
  if (typeof realm === "string" && realm.length > 0) out.realm = realm;
  return out;
};

const COORD_MAX = 1_000_000;
const NAME_MAX = 80;

const REALM_MAX = 32;
const REALM_RE = /^[A-Za-z0-9_-]+$/;

export const validateOverlay = (o: TileOverlay): boolean => {
  if (!Number.isInteger(o.x) || Math.abs(o.x) > COORD_MAX) return false;
  if (!Number.isInteger(o.y) || Math.abs(o.y) > COORD_MAX) return false;
  if (!Number.isInteger(o.z) || Math.abs(o.z) > COORD_MAX) return false;
  if (o.realm !== undefined) {
    if (typeof o.realm !== "string" || o.realm.length === 0 || o.realm.length > REALM_MAX) return false;
    if (!REALM_RE.test(o.realm)) return false;
  }
  const checkStr = (s: string | undefined, max: number) => {
    if (s === undefined) return true;
    if (typeof s !== "string" || s.length > max) return false;
    return !/[\[\]]/.test(s);
  };
  if (o.glyph !== undefined && (typeof o.glyph !== "string" || o.glyph.length !== 1)) {
    return false;
  }
  if (!checkStr(o.name, NAME_MAX)) return false;
  if (!checkStr(o.faction, NAME_MAX)) return false;
  if (!checkStr(o.kind, NAME_MAX)) return false;
  if (!checkStr(o.biome, NAME_MAX)) return false;
  if (o.desc !== undefined && (typeof o.desc !== "string" || o.desc.length > 2048)) {
    return false;
  }
  return true;
};

export const setPlayerCoord = async (
  u: IUrsamuSDK,
  playerId: string,
  coord: Coord,
): Promise<void> => {
  const stored: Coord = { x: coord.x, y: coord.y, z: coord.z };
  if (coord.realm !== undefined && coord.realm.length > 0) stored.realm = coord.realm;
  await u.db.modify(playerId, "$set", { "data.coord": stored });
};

/** Re-exported so REALM is queryable from peer modules without re-deriving. */
export { realmOf };
