import { DBO, dbojs } from "ursamu";
import type { IUrsamuSDK } from "ursamu";
import {
  type Coord,
  CONTROLLING_STATE_FIELD,
  ENTITY_COLLECTION,
  MAP_CAPABLE_FLAG,
  type MapEntity,
  MAX_VISION,
  realmOf,
  SPECTATING_STATE_FIELD,
} from "./schemas.ts";

type StoredEntity = MapEntity & { id: string };

const entities = new DBO<StoredEntity>(ENTITY_COLLECTION);

const COORD_MAX = 1_000_000;
const ID_MAX = 64;
const KIND_MAX = 32;
const NAME_MAX = 80;
const STATUS_MAX = 240;
const REGION_MAX_TILES = 4096;
const ADMIN_FLAGS = ["admin", "wizard", "superuser"];

const hasBrackets = (s: string): boolean => /[\[\]]/.test(s);

const checkText = (s: string | undefined, max: number): boolean => {
  if (s === undefined) return true;
  if (typeof s !== "string" || s.length === 0 || s.length > max) return false;
  return !hasBrackets(s);
};

export const validateEntity = (e: MapEntity): boolean => {
  if (typeof e.id !== "string" || e.id.length === 0 || e.id.length > ID_MAX) {
    return false;
  }
  if (!e.coord || typeof e.coord !== "object") return false;
  const { x, y, z } = e.coord;
  if (!Number.isInteger(x) || Math.abs(x) > COORD_MAX) return false;
  if (!Number.isInteger(y) || Math.abs(y) > COORD_MAX) return false;
  if (!Number.isInteger(z) || Math.abs(z) > COORD_MAX) return false;
  if (e.coord.realm !== undefined) {
    const r = e.coord.realm;
    if (typeof r !== "string" || r.length === 0 || r.length > 32) return false;
    if (!/^[A-Za-z0-9_-]+$/.test(r)) return false;
  }
  if (typeof e.glyph !== "string" || e.glyph.length !== 1) return false;
  if (e.glyph.charCodeAt(0) > 0xff) return false;
  if (typeof e.kind !== "string" || e.kind.length === 0 || e.kind.length > KIND_MAX) {
    return false;
  }
  if (hasBrackets(e.kind)) return false;
  if (typeof e.name !== "string" || e.name.length === 0 || e.name.length > NAME_MAX) {
    return false;
  }
  if (hasBrackets(e.name)) return false;
  if (!Number.isInteger(e.vision) || e.vision < 0 || e.vision > MAX_VISION) {
    return false;
  }
  if (e.factionId !== undefined) {
    if (typeof e.factionId !== "string" || e.factionId.length === 0) return false;
    if (e.factionId.length > NAME_MAX || hasBrackets(e.factionId)) return false;
  }
  if (!checkText(e.status, STATUS_MAX)) return false;
  if (e.containerId !== undefined && typeof e.containerId !== "string") return false;
  if (e.controllerId !== undefined && typeof e.controllerId !== "string") return false;
  if (e.lastDock !== undefined && typeof e.lastDock !== "string") return false;
  if (e.hidden !== undefined && typeof e.hidden !== "boolean") return false;
  return true;
};

const stripId = (rec: StoredEntity): MapEntity => {
  const { id: _id, ...rest } = rec;
  return { ...rest, id: rec.id };
};

export const getEntity = async (id: string): Promise<MapEntity | null> => {
  const rec = await entities.findOne({ id });
  return rec ? stripId(rec) : null;
};

export const setEntity = async (entity: MapEntity): Promise<void> => {
  if (!validateEntity(entity)) {
    throw new Error("setEntity: invalid entity payload");
  }
  const record: StoredEntity = { ...entity };
  await entities.update({ id: entity.id }, record);
};

export const destroyEntity = async (id: string): Promise<void> => {
  await entities.delete({ id });
};

export const getEntitiesByContainer = async (
  containerId: string,
): Promise<MapEntity[]> => {
  const all = await entities.all();
  return all.filter((e) => e.containerId === containerId).map(stripId);
};

export const getEntitiesByController = async (
  controllerId: string,
): Promise<MapEntity[]> => {
  const all = await entities.all();
  return all.filter((e) => e.controllerId === controllerId).map(stripId);
};

export const getEntitiesByFaction = async (
  factionId: string,
): Promise<MapEntity[]> => {
  const all = await entities.all();
  return all.filter((e) => e.factionId === factionId).map(stripId);
};

export const getEntitiesInRegion = async (
  min: Coord,
  max: Coord,
): Promise<MapEntity[]> => {
  const xLo = Math.min(min.x, max.x);
  const xHi = Math.max(min.x, max.x);
  const yLo = Math.min(min.y, max.y);
  const yHi = Math.max(min.y, max.y);
  const zLo = Math.min(min.z, max.z);
  const zHi = Math.max(min.z, max.z);
  const span = (xHi - xLo + 1) * (yHi - yLo + 1) * (zHi - zLo + 1);
  if (span > REGION_MAX_TILES) {
    throw new Error("getEntitiesInRegion: region too large");
  }
  const realm = realmOf(min);
  const all = await entities.all();
  return all
    .filter((e) =>
      realmOf(e.coord) === realm &&
      e.coord.x >= xLo && e.coord.x <= xHi &&
      e.coord.y >= yLo && e.coord.y <= yHi &&
      e.coord.z >= zLo && e.coord.z <= zHi
    )
    .map(stripId);
};

export const moveEntity = async (id: string, to: Coord): Promise<MapEntity> => {
  const current = await getEntity(id);
  if (!current) throw new Error("moveEntity: entity not found");
  const next: MapEntity = { ...current, coord: to };
  await setEntity(next);
  return next;
};

const hasAdminFlag = (flags: unknown): boolean => {
  if (!Array.isArray(flags)) return false;
  const lower = flags
    .filter((f): f is string => typeof f === "string")
    .map((f) => f.toLowerCase());
  return ADMIN_FLAGS.some((a) => lower.includes(a));
};

const hasFlag = (flags: unknown, name: string): boolean => {
  if (!Array.isArray(flags)) return false;
  const target = name.toLowerCase();
  return flags
    .filter((f): f is string => typeof f === "string")
    .some((f) => f.toLowerCase() === target);
};

export const getActiveEntity = async (
  u: IUrsamuSDK,
): Promise<{ entity: MapEntity; mode: "container" | "link" | "spectate" } | null> => {
  const me = u.me as unknown as {
    id: string;
    flags?: unknown;
    state?: Record<string, unknown>;
    location?: string;
  };
  const state = me.state ?? {};

  if (hasAdminFlag(me.flags)) {
    const spec = state[SPECTATING_STATE_FIELD];
    if (typeof spec === "string" && spec.length > 0) {
      const entity = await getEntity(spec);
      if (entity) return { entity, mode: "spectate" };
    }
  }

  if (typeof me.location === "string" && me.location.length > 0) {
    const loc = await dbojs.queryOne({ id: me.location });
    if (loc && hasFlag((loc as { flags?: unknown }).flags, MAP_CAPABLE_FLAG)) {
      const all = await entities.all();
      const match = all.find((e) => e.containerId === me.location);
      if (match) return { entity: stripId(match), mode: "container" };
    }
  }

  const link = state[CONTROLLING_STATE_FIELD];
  if (typeof link === "string" && link.length > 0) {
    const entity = await getEntity(link);
    if (entity && entity.controllerId === me.id) {
      return { entity, mode: "link" };
    }
  }

  return null;
};
